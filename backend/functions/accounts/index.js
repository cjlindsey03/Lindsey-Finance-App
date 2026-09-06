const { queryByPK, get, put, doc, QueryCommand } = require('../../shared/db');
const { getHouseholdContext } = require('../../shared/auth');
const { ok, badRequest, notFound, parseBody } = require('../../shared/http');

const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE;
const BALANCE_SNAPSHOTS_TABLE = process.env.BALANCE_SNAPSHOTS_TABLE;

// plaidItemId is intentionally stripped — the frontend never needs it and it
// links back to the stored access token.
function toPublicAccount(account) {
  const { plaidItemId, ...rest } = account;
  const utilization =
    account.creditLimit > 0 ? (account.currentBalance / account.creditLimit) * 100 : null;
  return { accountId: account.SK, utilization, ...rest };
}

// Only these are user-editable — balances and Plaid identifiers are owned by sync.
const EDITABLE_FIELDS = [
  'name',
  'apr',
  'minimumPayment',
  'statementCloseDay',
  'dueDay',
  'isG1Target',
  'g1Order',
  'isActive',
  'creditLimit',
  'currentBalance',
];

exports.handler = async (event) => {
  const { householdId } = getHouseholdContext(event);
  const accountId = event.pathParameters?.accountId;
  const method = event.requestContext?.http?.method || 'GET';

  if (method === 'PUT') {
    if (!accountId) return badRequest('accountId is required');
    const body = parseBody(event);
    if (!body) return badRequest('Invalid JSON body');

    const existing = await get(ACCOUNTS_TABLE, { PK: householdId, SK: accountId });
    if (!existing) return notFound('Account not found');

    const updates = Object.fromEntries(
      Object.entries(body).filter(([key]) => EDITABLE_FIELDS.includes(key))
    );
    const updated = { ...existing, ...updates };

    // Only manual accounts accept a hand-entered balance; Plaid owns the rest.
    if (!existing.isManual) updated.currentBalance = existing.currentBalance;

    await put(ACCOUNTS_TABLE, updated);
    return ok({ account: toPublicAccount(updated) });
  }

  if (accountId) {
    const account = await queryByPK(ACCOUNTS_TABLE, householdId).then((items) =>
      items.find((a) => a.SK === accountId)
    );
    if (!account) return notFound('Account not found');

    const result = await doc.send(
      new QueryCommand({
        TableName: BALANCE_SNAPSHOTS_TABLE,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': accountId },
        ScanIndexForward: true,
      })
    );

    return ok({
      account: toPublicAccount(account),
      history: (result.Items ?? []).map((s) => ({
        date: s.SK,
        balance: s.balance,
        available: s.available,
        limit: s.limit,
        utilization: s.utilization,
      })),
    });
  }

  const accounts = await queryByPK(ACCOUNTS_TABLE, householdId);
  return ok({ accounts: accounts.filter((a) => a.isActive !== false).map(toPublicAccount) });
};
