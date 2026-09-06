const { get, put, queryByPK } = require('../../shared/db');
const { getHouseholdContext } = require('../../shared/auth');
const { ok, badRequest, parseBody } = require('../../shared/http');

const G2_TABLE = process.env.G2_TABLE;
const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE;

function project({ targetAmount, currentAmount, monthlyContribution, pcsDate }) {
  if (!monthlyContribution || currentAmount >= targetAmount) {
    return { monthsToGoal: 0, projectedReachDate: null, willReachByPCS: currentAmount >= targetAmount };
  }

  const monthsToGoal = Math.ceil((targetAmount - currentAmount) / monthlyContribution);
  const reach = new Date();
  reach.setMonth(reach.getMonth() + monthsToGoal);
  const projectedReachDate = reach.toISOString().slice(0, 10);

  return {
    monthsToGoal,
    projectedReachDate,
    willReachByPCS: pcsDate ? projectedReachDate <= pcsDate : null,
  };
}

// Current balance is always read live from the linked savings account so it
// tracks Plaid rather than drifting from a stored copy.
async function currentSavingsBalance(householdId, savingsAccountId) {
  if (!savingsAccountId) return 0;
  const accounts = await queryByPK(ACCOUNTS_TABLE, householdId);
  return accounts.find((a) => a.SK === savingsAccountId)?.currentBalance ?? 0;
}

async function getG2(householdId) {
  const record = (await get(G2_TABLE, { PK: householdId })) ?? {
    PK: householdId,
    targetAmount: 0,
    savingsAccountId: null,
    monthlyContribution: 0,
    pcsDate: null,
    notes: '',
  };

  const currentAmount = await currentSavingsBalance(householdId, record.savingsAccountId);
  const { PK, ...rest } = record;

  return ok({ ...rest, currentAmount, ...project({ ...record, currentAmount }) });
}

exports.handler = async (event) => {
  const { householdId } = getHouseholdContext(event);
  const method = event.requestContext?.http?.method || 'GET';

  if (method === 'PUT') {
    const body = parseBody(event);
    if (!body) return badRequest('Invalid JSON body');

    const existing = (await get(G2_TABLE, { PK: householdId })) ?? {};
    await put(G2_TABLE, {
      ...existing,
      ...body,
      PK: householdId,
      updatedAt: new Date().toISOString(),
    });
  }

  return getG2(householdId);
};
