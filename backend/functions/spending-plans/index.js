const { randomUUID } = require('crypto');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { queryByPK, get, put, del } = require('../../shared/db');
const { getHouseholdContext } = require('../../shared/auth');
const { ok, badRequest, notFound, noContent, parseBody } = require('../../shared/http');
const { getPeriod, currentPeriod, nextPeriod } = require('../../shared/payPeriod');
const { writeBalanceSnapshot } = require('../../shared/snapshots');
const { renderPlanPdf } = require('../../shared/planReport');

const SPENDING_PLANS_TABLE = process.env.SPENDING_PLANS_TABLE;
const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE;
const G2_TABLE = process.env.G2_TABLE;
const REPORTS_BUCKET = process.env.REPORTS_BUCKET;

// The bucket is private, so each view mints a fresh short-lived link rather
// than storing one that would go stale — same pattern the Reports page uses.
const URL_TTL_SECONDS = 900;

const s3 = new S3Client({});

const GRADE_THRESHOLDS = [
  { grade: 'A', min: 25 },
  { grade: 'B', min: 20 },
  { grade: 'C', min: 15 },
  { grade: 'D', min: 10 },
];

const toPublicPlan = ({ PK, SK, ...rest }) => ({ planId: SK, ...rest });

// A plan's life: draft -> committed (scheduled, no money moved yet) ->
// applied (the pay period started and the balances actually moved).
// Both of the latter mean "this is the plan for that period".
const isCommitted = (plan) => plan?.status === 'committed' || plan?.status === 'applied';

function scorePlan({ income, allocations = {}, g1Extra = 0, g2Allocation = 0 }) {
  if (!income) {
    return { score: 'F', scoreBreakdown: { debtContributionPct: 0, savingsContributionPct: 0, combinedPct: 0 } };
  }

  // Car notes are debt — they just get their own line on the form. Counting
  // them here keeps the grade honest when a payment is re-filed out of
  // Debt_Payment into Car_Payment.
  const debtPaid = (allocations.Debt_Payment ?? 0) + (allocations.Car_Payment ?? 0) + g1Extra;
  const debtContributionPct = (debtPaid / income) * 100;
  const savingsContributionPct = (g2Allocation / income) * 100;
  const combinedPct = debtContributionPct + savingsContributionPct;
  const score = GRADE_THRESHOLDS.find((t) => combinedPct >= t.min)?.grade ?? 'F';

  // How much more toward debt or savings would earn the next grade up —
  // the actionable half of the score.
  const nextGrade = [...GRADE_THRESHOLDS].reverse().find((t) => t.min > combinedPct);

  return {
    score,
    scoreBreakdown: {
      debtContributionPct: Math.round(debtContributionPct * 10) / 10,
      savingsContributionPct: Math.round(savingsContributionPct * 10) / 10,
      combinedPct: Math.round(combinedPct * 10) / 10,
      nextGrade: nextGrade?.grade ?? null,
      amountToNextGrade: nextGrade
        ? Math.round(((nextGrade.min - combinedPct) / 100) * income * 100) / 100
        : null,
    },
  };
}

async function listPlans(householdId) {
  const plans = await queryByPK(SPENDING_PLANS_TABLE, householdId);
  // You plan for the period that hasn't started yet — the aim is a plan in
  // hand when the check lands, not a budget for a period already underway.
  const planning = nextPeriod();

  const drafts = plans
    .filter((p) => p.status === 'draft' && p.periodKey === planning.periodKey)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  const committed = plans
    .filter(isCommitted)
    .sort((a, b) => (b.periodKey ?? '').localeCompare(a.periodKey ?? ''));

  return ok({
    planningPeriod: planning,
    currentPeriod: currentPeriod(),
    drafts: drafts.map(toPublicPlan),
    committed: committed.map(toPublicPlan),
  });
}

async function savePlan(householdId, planId, body) {
  const existing = planId ? await get(SPENDING_PLANS_TABLE, { PK: householdId, SK: planId }) : null;
  if (planId && !existing) return notFound('Plan not found');
  if (isCommitted(existing)) return badRequest('A committed plan cannot be edited');

  const period = body.periodStart ? getPeriod(body.periodStart) : existing ? getPeriod(existing.periodStart) : nextPeriod();
  const { score, scoreBreakdown } = scorePlan(body);
  const now = new Date().toISOString();

  const plan = {
    PK: householdId,
    SK: planId ?? randomUUID(),
    status: 'draft',
    periodKey: period.periodKey,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    label: body.label ?? existing?.label ?? `${period.periodStart} draft`,
    income: Number(body.income) || 0,
    allocations: body.allocations ?? {},
    g1Extra: Number(body.g1Extra) || 0,
    g2Allocation: Number(body.g2Allocation) || 0,
    notes: body.notes ?? '',
    score,
    scoreBreakdown,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await put(SPENDING_PLANS_TABLE, plan);
  return ok({ plan: toPublicPlan(plan) });
}

// Committing schedules a plan; it does not move money. You plan for the pay
// period that hasn't started yet, so applying the payments now would spend a
// paycheck that hasn't landed. The daily job in shared/applyPlans.js moves the
// balances once periodStart arrives.
async function commitPlan(householdId, planId, body) {
  const plan = await get(SPENDING_PLANS_TABLE, { PK: householdId, SK: planId });
  if (!plan) return notFound('Plan not found');
  if (isCommitted(plan)) return badRequest('This plan is already committed');

  const siblings = await queryByPK(SPENDING_PLANS_TABLE, householdId);
  const alreadyCommitted = siblings.find((p) => isCommitted(p) && p.periodKey === plan.periodKey);
  if (alreadyCommitted) {
    return badRequest(`A plan is already committed for ${plan.periodKey} — balances would be applied twice`);
  }

  const committed = {
    ...plan,
    status: 'committed',
    accountPayments: body?.accountPayments ?? {},
    savingsAmount: Number(body?.savingsAmount) || 0,
    committedAt: new Date().toISOString(),
  };
  await put(SPENDING_PLANS_TABLE, committed);

  // No balance changes yet — the UI reports when they'll happen instead.
  return ok({ plan: toPublicPlan(committed), changes: [], appliesOn: plan.periodStart });
}

// Reverses everything commitPlan did: adds the account payments back, takes
// the savings amount back out, and returns the plan to an editable draft.
// Snapshots use a distinct 'plan-revert' type so the audit trail shows a
// reversal rather than a second payment.
async function uncommitPlan(householdId, planId) {
  const plan = await get(SPENDING_PLANS_TABLE, { PK: householdId, SK: planId });
  if (!plan) return notFound('Plan not found');
  if (!isCommitted(plan)) return badRequest('Only a committed plan can be uncommitted');

  // A plan that hasn't reached its pay period yet never moved any money, so
  // there is nothing to reverse — just hand it back as a draft.
  if (plan.status === 'committed') {
    const { accountPayments, savingsAmount, committedAt, ...rest } = plan;
    const reverted = { ...rest, status: 'draft' };
    await put(SPENDING_PLANS_TABLE, reverted);
    return ok({ plan: toPublicPlan(reverted), changes: [], wasApplied: false });
  }

  const changes = [];

  for (const [accountId, rawAmount] of Object.entries(plan.accountPayments ?? {})) {
    const amount = Number(rawAmount) || 0;
    if (amount <= 0) continue;

    const account = await get(ACCOUNTS_TABLE, { PK: householdId, SK: accountId });
    if (!account) continue;

    const before = account.currentBalance ?? 0;
    const updated = { ...account, currentBalance: Math.round((before + amount) * 100) / 100 };
    await put(ACCOUNTS_TABLE, updated);
    await writeBalanceSnapshot(householdId, updated, 'plan-revert');
    changes.push({ accountId, name: account.name, payment: -amount, before, after: updated.currentBalance });
  }

  const savingsAmount = Number(plan.savingsAmount) || 0;
  if (savingsAmount > 0) {
    const g2 = await get(G2_TABLE, { PK: householdId });
    const savingsAccountId = g2?.savingsAccountId;
    const savings = savingsAccountId
      ? await get(ACCOUNTS_TABLE, { PK: householdId, SK: savingsAccountId })
      : null;

    if (savings) {
      const before = savings.currentBalance ?? 0;
      const updated = { ...savings, currentBalance: Math.round((before - savingsAmount) * 100) / 100 };
      await put(ACCOUNTS_TABLE, updated);
      await writeBalanceSnapshot(householdId, updated, 'plan-revert');
      changes.push({
        accountId: savingsAccountId,
        name: savings.name,
        payment: savingsAmount,
        before,
        after: updated.currentBalance,
      });
    }
  }

  const { accountPayments, savingsAmount: _savingsAmount, committedAt, appliedAt, ...rest } = plan;
  const reverted = { ...rest, status: 'draft' };
  await put(SPENDING_PLANS_TABLE, reverted);

  return ok({ plan: toPublicPlan(reverted), changes, wasApplied: true });
}

async function planPdf(householdId, planId) {
  const plan = await get(SPENDING_PLANS_TABLE, { PK: householdId, SK: planId });
  if (!plan) return notFound('Plan not found');

  const accountIds = Object.keys(plan.accountPayments ?? {});
  const accountNames = {};
  for (const accountId of accountIds) {
    const account = await get(ACCOUNTS_TABLE, { PK: householdId, SK: accountId });
    if (account) accountNames[accountId] = account.name;
  }

  const pdf = await renderPlanPdf(toPublicPlan(plan), accountNames);
  const s3Key = `${householdId}/plans/${planId}.pdf`;

  await s3.send(
    new PutObjectCommand({ Bucket: REPORTS_BUCKET, Key: s3Key, Body: pdf, ContentType: 'application/pdf' })
  );

  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: REPORTS_BUCKET, Key: s3Key }), {
    expiresIn: URL_TTL_SECONDS,
  });

  return ok({ url, urlExpiresInSeconds: URL_TTL_SECONDS });
}

exports.handler = async (event) => {
  const { householdId } = getHouseholdContext(event);
  const method = event.requestContext?.http?.method || 'GET';
  const planId = event.pathParameters?.planId;
  const path = event.requestContext?.http?.path || '';

  if (method === 'GET') {
    if (!planId) return listPlans(householdId);
    if (path.endsWith('/pdf')) return planPdf(householdId, planId);
    const plan = await get(SPENDING_PLANS_TABLE, { PK: householdId, SK: planId });
    return plan ? ok({ plan: toPublicPlan(plan) }) : notFound('Plan not found');
  }

  if (method === 'DELETE') {
    if (!planId) return badRequest('planId is required');
    const existing = await get(SPENDING_PLANS_TABLE, { PK: householdId, SK: planId });
    if (!existing) return notFound('Plan not found');
    if (isCommitted(existing)) return badRequest('Committed plans are kept as history');
    await del(SPENDING_PLANS_TABLE, { PK: householdId, SK: planId });
    return noContent();
  }

  const body = parseBody(event);
  if (!body) return badRequest('Invalid JSON body');

  if (method === 'POST' && path.endsWith('/commit')) {
    if (!planId) return badRequest('planId is required');
    return commitPlan(householdId, planId, body);
  }
  if (method === 'POST' && path.endsWith('/uncommit')) {
    if (!planId) return badRequest('planId is required');
    return uncommitPlan(householdId, planId);
  }
  if (method === 'POST') return savePlan(householdId, null, body);
  if (method === 'PUT') {
    if (!planId) return badRequest('planId is required');
    return savePlan(householdId, planId, body);
  }

  return badRequest(`Unsupported method ${method}`);
};
