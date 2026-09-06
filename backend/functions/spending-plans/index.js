const { queryByPK, get, put } = require('../../shared/db');
const { getHouseholdContext } = require('../../shared/auth');
const { ok, badRequest, notFound, parseBody } = require('../../shared/http');

const SPENDING_PLANS_TABLE = process.env.SPENDING_PLANS_TABLE;
const TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE;

const PAY_PERIOD_DAYS = 14;

function scorePlan({ income, allocations = {}, g1Extra = 0, g2Allocation = 0 }) {
  if (!income) return { score: 'F', scoreBreakdown: { combinedPct: 0 } };

  const debtContributionPct = (((allocations.Debt_Payment ?? 0) + g1Extra) / income) * 100;
  const savingsContributionPct = (g2Allocation / income) * 100;
  const combinedPct = debtContributionPct + savingsContributionPct;

  const score =
    combinedPct >= 25 ? 'A' : combinedPct >= 20 ? 'B' : combinedPct >= 15 ? 'C' : combinedPct >= 10 ? 'D' : 'F';

  return {
    score,
    scoreBreakdown: {
      debtContributionPct: Math.round(debtContributionPct * 10) / 10,
      savingsContributionPct: Math.round(savingsContributionPct * 10) / 10,
      combinedPct: Math.round(combinedPct * 10) / 10,
    },
  };
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function getPlanWithActuals(householdId, payDate) {
  const plan = await get(SPENDING_PLANS_TABLE, { PK: householdId, SK: payDate });
  if (!plan) return notFound('Plan not found');

  const periodEnd = addDays(payDate, PAY_PERIOD_DAYS);
  const transactions = await queryByPK(TRANSACTIONS_TABLE, householdId);

  const actuals = {};
  for (const tx of transactions) {
    if (tx.date < payDate || tx.date > periodEnd || tx.isTransfer) continue;
    const category = tx.resolvedCategory ?? 'Other';
    actuals[category] = (actuals[category] ?? 0) + tx.amount;
  }

  const { PK, SK, ...rest } = plan;
  return ok({ plan: { payDate: SK, ...rest }, actuals, periodEnd });
}

async function listPlans(householdId) {
  const plans = await queryByPK(SPENDING_PLANS_TABLE, householdId);
  plans.sort((a, b) => b.SK.localeCompare(a.SK));
  return ok({ plans: plans.map(({ PK, SK, ...rest }) => ({ payDate: SK, ...rest })) });
}

async function savePlan(householdId, payDate, body) {
  const targetDate = payDate ?? body.payDate;
  if (!targetDate) return badRequest('payDate is required');

  const existing = await get(SPENDING_PLANS_TABLE, { PK: householdId, SK: targetDate });
  const { score, scoreBreakdown } = scorePlan(body);
  const now = new Date().toISOString();

  const plan = {
    PK: householdId,
    SK: targetDate,
    label: body.label ?? existing?.label ?? `${targetDate} Plan`,
    income: body.income ?? 0,
    allocations: body.allocations ?? {},
    notes: body.notes ?? '',
    g1Extra: body.g1Extra ?? 0,
    g2Allocation: body.g2Allocation ?? 0,
    score,
    scoreBreakdown,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await put(SPENDING_PLANS_TABLE, plan);

  const { PK, SK, ...rest } = plan;
  return ok({ plan: { payDate: SK, ...rest } });
}

exports.handler = async (event) => {
  const { householdId } = getHouseholdContext(event);
  const method = event.requestContext?.http?.method || 'GET';
  const payDate = event.pathParameters?.payDate;

  if (method === 'GET') {
    return payDate ? getPlanWithActuals(householdId, payDate) : listPlans(householdId);
  }

  const body = parseBody(event);
  if (!body) return badRequest('Invalid JSON body');
  return savePlan(householdId, payDate, body);
};
