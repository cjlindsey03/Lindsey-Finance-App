const { randomUUID } = require('crypto');
const { queryByPK, get, put, del } = require('../../shared/db');
const { getHouseholdContext } = require('../../shared/auth');
const { ok, badRequest, notFound, noContent, parseBody } = require('../../shared/http');
const { getPeriod, currentPeriod, nextPeriod } = require('../../shared/payPeriod');
const { writeBalanceSnapshot } = require('../../shared/snapshots');

const SPENDING_PLANS_TABLE = process.env.SPENDING_PLANS_TABLE;
const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE;
const G2_TABLE = process.env.G2_TABLE;

const GRADE_THRESHOLDS = [
  { grade: 'A', min: 25 },
  { grade: 'B', min: 20 },
  { grade: 'C', min: 15 },
  { grade: 'D', min: 10 },
];

const toPublicPlan = ({ PK, SK, ...rest }) => ({ planId: SK, ...rest });

function scorePlan({ income, allocations = {}, g1Extra = 0, g2Allocation = 0 }) {
  if (!income) {
    return { score: 'F', scoreBreakdown: { debtContributionPct: 0, savingsContributionPct: 0, combinedPct: 0 } };
  }

  const debtContributionPct = (((allocations.Debt_Payment ?? 0) + g1Extra) / income) * 100;
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
    .filter((p) => p.status === 'committed')
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
  if (existing?.status === 'committed') return badRequest('A committed plan cannot be edited');

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

// Committing is what actually moves money in the app: the payments entered on
// the commit form are applied to real account balances, which is what then
// updates G1, G3 and the dashboard.
async function commitPlan(householdId, planId, body) {
  const plan = await get(SPENDING_PLANS_TABLE, { PK: householdId, SK: planId });
  if (!plan) return notFound('Plan not found');
  if (plan.status === 'committed') return badRequest('This plan is already committed');

  const siblings = await queryByPK(SPENDING_PLANS_TABLE, householdId);
  const alreadyCommitted = siblings.find(
    (p) => p.status === 'committed' && p.periodKey === plan.periodKey
  );
  if (alreadyCommitted) {
    return badRequest(`A plan is already committed for ${plan.periodKey} — balances would be applied twice`);
  }

  const accountPayments = body?.accountPayments ?? {};
  const savingsAmount = Number(body?.savingsAmount) || 0;
  const changes = [];

  for (const [accountId, rawAmount] of Object.entries(accountPayments)) {
    const amount = Number(rawAmount) || 0;
    if (amount <= 0) continue;

    const account = await get(ACCOUNTS_TABLE, { PK: householdId, SK: accountId });
    if (!account) continue;

    const before = account.currentBalance ?? 0;
    const updated = { ...account, currentBalance: Math.round((before - amount) * 100) / 100 };
    await put(ACCOUNTS_TABLE, updated);
    await writeBalanceSnapshot(householdId, updated, 'plan');
    changes.push({ accountId, name: account.name, payment: amount, before, after: updated.currentBalance });
  }

  if (savingsAmount > 0) {
    const g2 = await get(G2_TABLE, { PK: householdId });
    const savingsAccountId = g2?.savingsAccountId;
    const savings = savingsAccountId
      ? await get(ACCOUNTS_TABLE, { PK: householdId, SK: savingsAccountId })
      : null;

    if (savings) {
      const before = savings.currentBalance ?? 0;
      const updated = { ...savings, currentBalance: Math.round((before + savingsAmount) * 100) / 100 };
      await put(ACCOUNTS_TABLE, updated);
      await writeBalanceSnapshot(householdId, updated, 'plan');
      changes.push({
        accountId: savingsAccountId,
        name: savings.name,
        payment: -savingsAmount,
        before,
        after: updated.currentBalance,
      });
    }
  }

  const committed = {
    ...plan,
    status: 'committed',
    accountPayments,
    savingsAmount,
    committedAt: new Date().toISOString(),
  };
  await put(SPENDING_PLANS_TABLE, committed);

  return ok({ plan: toPublicPlan(committed), changes });
}

exports.handler = async (event) => {
  const { householdId } = getHouseholdContext(event);
  const method = event.requestContext?.http?.method || 'GET';
  const planId = event.pathParameters?.planId;
  const path = event.requestContext?.http?.path || '';

  if (method === 'GET') {
    if (!planId) return listPlans(householdId);
    const plan = await get(SPENDING_PLANS_TABLE, { PK: householdId, SK: planId });
    return plan ? ok({ plan: toPublicPlan(plan) }) : notFound('Plan not found');
  }

  if (method === 'DELETE') {
    if (!planId) return badRequest('planId is required');
    const existing = await get(SPENDING_PLANS_TABLE, { PK: householdId, SK: planId });
    if (!existing) return notFound('Plan not found');
    if (existing.status === 'committed') return badRequest('Committed plans are kept as history');
    await del(SPENDING_PLANS_TABLE, { PK: householdId, SK: planId });
    return noContent();
  }

  const body = parseBody(event);
  if (!body) return badRequest('Invalid JSON body');

  if (method === 'POST' && path.endsWith('/commit')) {
    if (!planId) return badRequest('planId is required');
    return commitPlan(householdId, planId, body);
  }
  if (method === 'POST') return savePlan(householdId, null, body);
  if (method === 'PUT') {
    if (!planId) return badRequest('planId is required');
    return savePlan(householdId, planId, body);
  }

  return badRequest(`Unsupported method ${method}`);
};
