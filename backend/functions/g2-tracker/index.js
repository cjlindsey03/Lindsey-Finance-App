const { get, put, queryByPK } = require('../../shared/db');
const { getHouseholdContext } = require('../../shared/auth');
const { ok, badRequest, parseBody } = require('../../shared/http');
const { getActivePlan, getPendingPlans } = require('../../shared/activePlan');

const G2_TABLE = process.env.G2_TABLE;
const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE;

// Plans are per pay period (paid twice a month, 1st and 15th per the spec),
// so a plan's g2Allocation is doubled to get a monthly contribution figure.
const PAY_PERIODS_PER_MONTH = 2;

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

  const activePlan = await getActivePlan(householdId);
  const monthlyContribution =
    activePlan != null ? (activePlan.g2Allocation ?? 0) * PAY_PERIODS_PER_MONTH : record.monthlyContribution ?? 0;
  const monthlyContributionSource = activePlan != null ? 'plan' : 'manual';

  const currentAmount = await currentSavingsBalance(householdId, record.savingsAccountId);

  // Savings from a committed plan that hasn't reached its pay period yet.
  // currentAmount stays the real balance — this is shown alongside it as
  // projected, so the fund never appears to lose ground between periods.
  const pending = await getPendingPlans(householdId);
  const projectedDeposits = pending.reduce((sum, p) => sum + (Number(p.savingsAmount) || 0), 0);

  const { PK, ...rest } = record;

  return ok({
    ...rest,
    monthlyContribution,
    monthlyContributionSource,
    activePlanPayDate: activePlan?.payDate ?? null,
    currentAmount,
    projectedDeposits: Math.round(projectedDeposits * 100) / 100,
    projectedAmount: Math.round((currentAmount + projectedDeposits) * 100) / 100,
    ...project({ ...record, monthlyContribution, currentAmount }),
  });
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
