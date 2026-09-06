const { plaidClient } = require('./plaidClient');
const { get, put, queryByPK } = require('./db');
const { loadActiveRules, resolveCategory } = require('./categoryRules');

const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE;
const PLAID_ITEMS_TABLE = process.env.PLAID_ITEMS_TABLE;
const TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE;
const BALANCE_SNAPSHOTS_TABLE = process.env.BALANCE_SNAPSHOTS_TABLE;
const CATEGORY_RULES_TABLE = process.env.CATEGORY_RULES_TABLE;
const CASHFLOW_EVENTS_TABLE = process.env.CASHFLOW_EVENTS_TABLE;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function getLastCloseDate(statementCloseDay) {
  const now = new Date();
  const candidate = new Date(now.getFullYear(), now.getMonth(), statementCloseDay);
  if (candidate > now) candidate.setMonth(candidate.getMonth() - 1);
  return candidate.toISOString().slice(0, 10);
}

function getNextCloseDate(statementCloseDay) {
  const now = new Date();
  const candidate = new Date(now.getFullYear(), now.getMonth(), statementCloseDay);
  if (candidate <= now) candidate.setMonth(candidate.getMonth() + 1);
  return candidate.toISOString().slice(0, 10);
}

async function upsertAccountsAndSnapshots(householdId, plaidAccounts) {
  const results = [];
  for (const acct of plaidAccounts) {
    const existing = await get(ACCOUNTS_TABLE, { PK: householdId, SK: acct.account_id });
    const creditLimit = acct.balances.limit ?? existing?.creditLimit ?? null;
    const record = {
      PK: householdId,
      SK: acct.account_id,
      plaidAccountId: acct.account_id,
      plaidItemId: existing?.plaidItemId,
      name: existing?.name || acct.name,
      officialName: acct.official_name,
      type: acct.type,
      subtype: acct.subtype,
      currentBalance: acct.balances.current,
      availableBalance: acct.balances.available,
      creditLimit,
      apr: existing?.apr ?? null,
      minimumPayment: existing?.minimumPayment ?? null,
      statementCloseDay: existing?.statementCloseDay ?? null,
      dueDay: existing?.dueDay ?? null,
      isG1Target: existing?.isG1Target ?? false,
      g1Order: existing?.g1Order ?? null,
      isActive: existing?.isActive ?? true,
      isManual: false,
      lastSynced: new Date().toISOString(),
    };
    await put(ACCOUNTS_TABLE, record);

    const utilization = creditLimit ? (record.currentBalance / creditLimit) * 100 : null;
    await put(BALANCE_SNAPSHOTS_TABLE, {
      PK: acct.account_id,
      SK: todayIso(),
      balance: record.currentBalance,
      available: record.availableBalance,
      limit: creditLimit,
      utilization,
      householdId,
      source: 'plaid',
    });

    results.push(record);
  }
  return results;
}

async function syncTransactionsForItem(householdId, item) {
  const rules = await loadActiveRules(CATEGORY_RULES_TABLE, householdId);
  let cursor = item.cursor;
  let hasMore = true;
  const allAdded = [];

  while (hasMore) {
    const response = await plaidClient.transactionsSync({
      access_token: item.accessToken,
      cursor,
    });
    const { added, modified, has_more, next_cursor } = response.data;

    for (const tx of [...added, ...modified]) {
      const resolved = resolveCategory(
        { merchantName: tx.merchant_name, description: tx.name, plaidCategory: tx.category, amount: tx.amount },
        rules
      );
      await put(TRANSACTIONS_TABLE, {
        PK: householdId,
        SK: tx.transaction_id,
        accountId: tx.account_id,
        date: tx.date,
        amount: tx.amount,
        merchantName: tx.merchant_name || tx.name,
        description: tx.name,
        plaidCategory: tx.category || [],
        plaidCategoryId: tx.category_id,
        resolvedCategory: resolved.resolvedCategory,
        resolvedSubcategory: resolved.resolvedSubcategory,
        matchedRuleId: resolved.matchedRuleId,
        isIncome: tx.amount < 0 && (tx.category || []).includes('Payroll'),
        isTransfer: (tx.category || []).includes('Transfer'),
        isManuallyRecategorized: false,
        memo: '',
        pending: tx.pending,
      });
    }

    allAdded.push(...added);
    cursor = next_cursor;
    hasMore = has_more;
  }

  return { cursor, transactionCount: allAdded.length };
}

async function predictUpcomingPayments(householdId, accounts) {
  for (const account of accounts) {
    if (!account.statementCloseDay || !account.creditLimit) continue;

    const nextCloseDate = getNextCloseDate(account.statementCloseDay);
    const projectedMinimum = Math.max(account.currentBalance * 0.02, 25);
    const dueDate = addDays(nextCloseDate, 21);

    await put(CASHFLOW_EVENTS_TABLE, {
      PK: householdId,
      SK: `${dueDate}#predicted_${account.SK}`,
      eventDate: dueDate,
      eventId: `predicted_${account.SK}`,
      type: 'credit_payment',
      description: `${account.name} payment due`,
      amount: -projectedMinimum,
      accountId: account.SK,
      source: 'plaid',
      isRecurring: false,
      isPCSRelated: false,
    });
  }
}

async function syncHousehold(householdId) {
  const items = await queryByPK(PLAID_ITEMS_TABLE, householdId);
  const summary = [];

  for (const item of items) {
    if (item.status === 'error' || item.status === 'needs_reauth') continue;

    const accountsResponse = await plaidClient.accountsGet({ access_token: item.accessToken });
    const accounts = await upsertAccountsAndSnapshots(householdId, accountsResponse.data.accounts);

    const { cursor, transactionCount } = await syncTransactionsForItem(householdId, item);
    await put(PLAID_ITEMS_TABLE, { ...item, cursor, lastSync: new Date().toISOString(), status: 'active' });

    await predictUpcomingPayments(householdId, accounts);

    summary.push({ itemId: item.SK, accountCount: accounts.length, transactionCount });
  }

  return summary;
}

module.exports = { syncHousehold, getLastCloseDate, getNextCloseDate, addDays, todayIso };
