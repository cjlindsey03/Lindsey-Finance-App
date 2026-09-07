const { queryByPK, get, put } = require('./db');
const { writeBalanceSnapshot } = require('./snapshots');

const SPENDING_PLANS_TABLE = process.env.SPENDING_PLANS_TABLE;
const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE;
const G2_TABLE = process.env.G2_TABLE;

// Committing a plan schedules it; it doesn't move money. The money moves when
// the pay period it was written for actually starts — you plan for the next
// period, so applying at commit time would spend a paycheck that hasn't
// landed. This runs daily and applies whatever has come due.
async function applyPlan(householdId, plan) {
  const changes = [];

  for (const [accountId, rawAmount] of Object.entries(plan.accountPayments ?? {})) {
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

  const savingsAmount = Number(plan.savingsAmount) || 0;
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

  await put(SPENDING_PLANS_TABLE, {
    ...plan,
    status: 'applied',
    appliedAt: new Date().toISOString(),
  });

  return changes;
}

// `today` is injectable so this can be tested against a date past a period
// start without waiting for the calendar.
async function applyDuePlans(householdId, today = new Date().toISOString().slice(0, 10)) {
  const plans = await queryByPK(SPENDING_PLANS_TABLE, householdId);

  const due = plans.filter(
    (p) => p.status === 'committed' && !p.appliedAt && (p.periodStart ?? '') <= today
  );

  const applied = [];
  for (const plan of due) {
    // Re-read immediately before writing so a plan can't be applied twice if
    // two runs overlap.
    const fresh = await get(SPENDING_PLANS_TABLE, { PK: plan.PK, SK: plan.SK });
    if (!fresh || fresh.status !== 'committed' || fresh.appliedAt) continue;

    const changes = await applyPlan(householdId, fresh);
    applied.push({ planId: fresh.SK, label: fresh.label, periodStart: fresh.periodStart, changes });
  }

  return applied;
}

module.exports = { applyDuePlans, applyPlan };
