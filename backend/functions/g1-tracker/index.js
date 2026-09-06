const { queryByPK, get, put } = require('../../shared/db');
const { getHouseholdContext } = require('../../shared/auth');
const { ok, badRequest, parseBody } = require('../../shared/http');
const { projectPayoff } = require('../../shared/snowball');
const { getActivePlan } = require('../../shared/activePlan');

const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE;

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
      creditLimit: a.creditLimit ?? null,
      utilization: a.creditLimit > 0 ? (a.currentBalance / a.creditLimit) * 100 : null,
      apr: a.apr ?? 0,
      minimumPayment: a.minimumPayment ?? null,
      g1Order: a.g1Order ?? null,
    }));

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);

  return ok({
    accounts,
    totalBalance,
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
