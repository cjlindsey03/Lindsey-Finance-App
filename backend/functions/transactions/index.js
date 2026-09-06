const { queryByPK, get, put } = require('../../shared/db');
const { getHouseholdContext } = require('../../shared/auth');
const { ok, badRequest, notFound, parseBody } = require('../../shared/http');

const TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE;

async function listTransactions(householdId, query) {
  const { startDate, endDate, accountId, category } = query;
  const excludeTransfers = query.excludeTransfers !== 'false';

  const all = await queryByPK(TRANSACTIONS_TABLE, householdId);

  const filtered = all.filter((tx) => {
    if (startDate && tx.date < startDate) return false;
    if (endDate && tx.date > endDate) return false;
    if (accountId && tx.accountId !== accountId) return false;
    if (category && tx.resolvedCategory !== category) return false;
    if (excludeTransfers && tx.isTransfer) return false;
    return true;
  });

  filtered.sort((a, b) => b.date.localeCompare(a.date));
  return ok({ transactions: filtered.map(({ PK, SK, ...rest }) => ({ transactionId: SK, ...rest })) });
}

async function categorize(householdId, transactionId, body) {
  if (!body?.category) return badRequest('category is required');

  const existing = await get(TRANSACTIONS_TABLE, { PK: householdId, SK: transactionId });
  if (!existing) return notFound('Transaction not found');

  const updated = {
    ...existing,
    resolvedCategory: body.category,
    resolvedSubcategory: body.subcategory ?? null,
    matchedRuleId: null,
    isManuallyRecategorized: true,
  };
  await put(TRANSACTIONS_TABLE, updated);

  const { PK, SK, ...rest } = updated;
  return ok({ transaction: { transactionId: SK, ...rest } });
}

exports.handler = async (event) => {
  const { householdId } = getHouseholdContext(event);
  const method = event.requestContext?.http?.method || 'GET';

  if (method === 'POST') {
    const transactionId = event.pathParameters?.transactionId;
    if (!transactionId) return badRequest('transactionId is required');
    const body = parseBody(event);
    if (!body) return badRequest('Invalid JSON body');
    return categorize(householdId, transactionId, body);
  }

  return listTransactions(householdId, event.queryStringParameters || {});
};
