const { queryByPK } = require('./db');
const { currentPeriod } = require('./payPeriod');

const SPENDING_PLANS_TABLE = process.env.SPENDING_PLANS_TABLE;

const toPublicPlan = ({ PK, SK, ...rest }) => ({ planId: SK, ...rest });

// Only a *committed* plan drives the goals — drafts are hypotheticals. Prefer
// the plan committed for the current pay period; otherwise fall back to the
// most recently committed one so G1/G2 keep showing something sensible
// between periods.
async function getActivePlan(householdId) {
  const plans = await queryByPK(SPENDING_PLANS_TABLE, householdId);
  const committed = plans.filter((p) => p.status === 'committed');
  if (!committed.length) return null;

  const { periodKey } = currentPeriod();
  const forThisPeriod = committed.find((p) => p.periodKey === periodKey);
  if (forThisPeriod) return toPublicPlan(forThisPeriod);

  const mostRecent = committed.sort((a, b) => (b.periodKey ?? '').localeCompare(a.periodKey ?? ''))[0];
  return toPublicPlan(mostRecent);
}

module.exports = { getActivePlan, toPublicPlan };
