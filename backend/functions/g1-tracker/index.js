const { queryByPK, get, put } = require('../../shared/db');
const { getHouseholdContext } = require('../../shared/auth');
const { ok, badRequest, parseBody } = require('../../shared/http');
const { projectPayoff } = require('../../shared/snowball');
const { getActivePlan, getPendingPlans } = require('../../shared/activePlan');

const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE;

// Where the payoff started. The household's own framing: the starting point is
// every credit card maxed out, so a card's baseline is its limit. Accounts with
// no limit (the BNPL) carry an explicit g1Baseline instead, set when the
// account was first tracked.
const baselineFor = (account) =>
  account.g1Baseline ?? (account.creditLimit > 0 ? account.creditLimit : account.currentBalance ?? 0);

async function getG1(householdId, query) {
  const strategy = query.strategy === 'avalanche' ? 'avalanche' : 'snowball';

  let monthlyExtra;
  let monthlyExtraSource;
  let activePlanPayDate = null;

  if (query.monthlyExtra != null) {
    monthlyExtra = Number(query.monthlyExtra);
    monthlyExtraSource = 'override';
  } else {
    const plan = await getActivePlan(householdId);
    if (plan) {
      monthlyExtra = plan.g1Extra ?? 0;
      monthlyExtraSource = 'plan';
      activePlanPayDate = plan.payDate;
    } else {
      monthlyExtra = 0;
      monthlyExtraSource = 'default';
    }
  }

  const accounts = (await queryByPK(ACCOUNTS_TABLE, householdId))
    .filter((a) => a.isG1Target)
    .sort((a, b) => (a.g1Order ?? 999) - (b.g1Order ?? 999))
    .map((a) => ({
      accountId: a.SK,
      name: a.name,
      balance: a.currentBalance ?? 0,
      baseline: baselineFor(a),
      creditLimit: a.creditLimit ?? null,
      utilization: a.creditLimit > 0 ? (a.currentBalance / a.creditLimit) * 100 : null,
      apr: a.apr ?? 0,
      minimumPayment: a.minimumPayment ?? null,
      g1Order: a.g1Order ?? null,
    }));

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);
  const baselineTotal = accounts.reduce((sum, a) => sum + a.baseline, 0);
  const paidDown = Math.max(0, baselineTotal - totalBalance);

  // Payments from a committed plan whose pay period hasn't started yet — real
  // progress that's coming, shown separately so actual progress never moves
  // until the money actually does.
  const pending = await getPendingPlans(householdId);
  const g1AccountIds = new Set(accounts.map((a) => a.accountId));
  const projectedPayments = pending.reduce(
    (sum, plan) =>
      sum +
      Object.entries(plan.accountPayments ?? {})
        .filter(([accountId]) => g1AccountIds.has(accountId))
        .reduce((s, [, amount]) => s + (Number(amount) || 0), 0),
    0
  );

  return ok({
    accounts,
    totalBalance,
    baselineTotal: Math.round(baselineTotal * 100) / 100,
    paidDown: Math.round(paidDown * 100) / 100,
    progressPct: baselineTotal > 0 ? Math.round((paidDown / baselineTotal) * 1000) / 10 : 0,
    projectedPayments: Math.round(projectedPayments * 100) / 100,
    monthlyExtra,
    monthlyExtraSource,
    activePlanPayDate,
    projection: projectPayoff(accounts, monthlyExtra, strategy),
  });
}

async function reorder(householdId, body) {
  if (!Array.isArray(body)) return badRequest('Body must be an array of { accountId, g1Order }');

  for (const { accountId, g1Order } of body) {
    const account = await get(ACCOUNTS_TABLE, { PK: householdId, SK: accountId });
    if (account) await put(ACCOUNTS_TABLE, { ...account, g1Order });
  }

  return getG1(householdId, {});
}

exports.handler = async (event) => {
  const { householdId } = getHouseholdContext(event);
  const method = event.requestContext?.http?.method || 'GET';

  if (method === 'PUT') {
    const body = parseBody(event);
    if (!body) return badRequest('Invalid JSON body');
    return reorder(householdId, body);
  }

  return getG1(householdId, event.queryStringParameters || {});
};
