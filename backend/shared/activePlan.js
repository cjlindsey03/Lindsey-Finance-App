const { queryByPK } = require('./db');
const { currentPeriod } = require('./payPeriod');

const SPENDING_PLANS_TABLE = process.env.SPENDING_PLANS_TABLE;

const toPublicPlan = ({ PK, SK, ...rest }) => ({ planId: SK, ...rest });

// A plan is "committed" from the moment you commit it, and "applied" once its
// pay period arrives and the balances actually move. Both count as decided.
const isCommitted = (plan) => plan?.status === 'committed' || plan?.status === 'applied';

// Only a decided plan drives the goals — drafts are hypotheticals. Prefer the
// plan for the current pay period; otherwise fall back to the most recent one
// so G1/G2 keep showing something sensible between periods.
async function getActivePlan(householdId) {
  const plans = await queryByPK(SPENDING_PLANS_TABLE, householdId);
  const committed = plans.filter(isCommitted);
  if (!committed.length) return null;

  const { periodKey } = currentPeriod();
  const forThisPeriod = committed.find((p) => p.periodKey === periodKey);
  if (forThisPeriod) return toPublicPlan(forThisPeriod);

  const mostRecent = committed.sort((a, b) => (b.periodKey ?? '').localeCompare(a.periodKey ?? ''))[0];
  return toPublicPlan(mostRecent);
}

// Plans that are committed but whose pay period hasn't arrived yet. Their
// money hasn't moved, so the goals show them as *projected* progress rather
// than folding them into the real balances.
async function getPendingPlans(householdId) {
  const plans = await queryByPK(SPENDING_PLANS_TABLE, householdId);
  return plans.filter((p) => p.status === 'committed' && !p.appliedAt).map(toPublicPlan);
}

module.exports = { getActivePlan, getPendingPlans, toPublicPlan, isCommitted };
