const { queryByPK } = require('./db');

const SPENDING_PLANS_TABLE = process.env.SPENDING_PLANS_TABLE;

// The "active" plan is the most recent one whose pay date has already
// started; if none has started yet (all plans are future-dated), fall back
// to the most recently created plan so a newly-scheduled plan still drives
// G1/G2 ahead of its pay date.
async function getActivePlan(householdId) {
  const plans = await queryByPK(SPENDING_PLANS_TABLE, householdId);
  if (!plans.length) return null;

  const todayIso = new Date().toISOString().slice(0, 10);
  const started = plans.filter((p) => p.SK <= todayIso).sort((a, b) => b.SK.localeCompare(a.SK));
  const fallback = [...plans].sort((a, b) => b.SK.localeCompare(a.SK))[0];

  const plan = started[0] ?? fallback;
  const { PK, SK, ...rest } = plan;
  return { payDate: SK, ...rest };
}

module.exports = { getActivePlan };
