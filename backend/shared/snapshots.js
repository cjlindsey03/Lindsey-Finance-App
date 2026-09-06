const { put } = require('./db');

const BALANCE_SNAPSHOTS_TABLE = process.env.BALANCE_SNAPSHOTS_TABLE;

// Balances only change when someone edits an account or commits a spending
// plan, so those are the two moments worth recording. The snapshot history
// is what gives G3 a utilization trend over time.
async function writeBalanceSnapshot(householdId, account, source) {
  const limit = account.creditLimit ?? null;
  await put(BALANCE_SNAPSHOTS_TABLE, {
    PK: account.SK,
    SK: new Date().toISOString(),
    balance: account.currentBalance ?? 0,
    available: limit != null ? limit - (account.currentBalance ?? 0) : null,
    limit,
    utilization: limit > 0 ? ((account.currentBalance ?? 0) / limit) * 100 : null,
    householdId,
    source,
  });
}

module.exports = { writeBalanceSnapshot };
