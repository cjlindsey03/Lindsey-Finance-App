const { randomUUID } = require('crypto');
const { queryByPK, get, put, del, doc, QueryCommand } = require('../../shared/db');
const { getHouseholdContext } = require('../../shared/auth');
const { ok, badRequest, notFound, noContent, parseBody } = require('../../shared/http');
const { writeBalanceSnapshot } = require('../../shared/snapshots');

const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE;
const BALANCE_SNAPSHOTS_TABLE = process.env.BALANCE_SNAPSHOTS_TABLE;

function toPublicAccount(account) {
  const { PK, SK, ...rest } = account;
  const utilization =
    account.creditLimit > 0 ? (account.currentBalance / account.creditLimit) * 100 : null;
  return { accountId: SK, utilization, ...rest };
}

// Every account is hand-maintained, so balances are editable like anything else.
const EDITABLE_FIELDS = [
  'name',
  'type',
  'subtype',
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

async function createAccount(householdId, body) {
  if (!body?.name || !body?.type) return badRequest('name and type are required');

  const account = {
    PK: householdId,
    SK: `manual_${randomUUID()}`,
    name: body.name,
    type: body.type,
    subtype: body.subtype ?? null,
    currentBalance: Number(body.currentBalance) || 0,
    creditLimit: body.creditLimit != null ? Number(body.creditLimit) : null,
    apr: body.apr != null ? Number(body.apr) : null,
    minimumPayment: body.minimumPayment != null ? Number(body.minimumPayment) : null,
    statementCloseDay: body.statementCloseDay != null ? Number(body.statementCloseDay) : null,
    dueDay: body.dueDay != null ? Number(body.dueDay) : null,
    isG1Target: body.isG1Target ?? false,
    g1Order: body.g1Order != null ? Number(body.g1Order) : null,
    isActive: true,
  };

  await put(ACCOUNTS_TABLE, account);
  await writeBalanceSnapshot(householdId, account, 'manual');
  return ok({ account: toPublicAccount(account) });
}

async function updateAccount(householdId, accountId, body) {
  const existing = await get(ACCOUNTS_TABLE, { PK: householdId, SK: accountId });
  if (!existing) return notFound('Account not found');

  const updates = Object.fromEntries(
    Object.entries(body).filter(([key]) => EDITABLE_FIELDS.includes(key))
  );
  const updated = { ...existing, ...updates };
  await put(ACCOUNTS_TABLE, updated);

  if (updated.currentBalance !== existing.currentBalance) {
    await writeBalanceSnapshot(householdId, updated, 'manual');
  }

  return ok({ account: toPublicAccount(updated) });
}

async function getAccountWithHistory(householdId, accountId) {
  const account = await get(ACCOUNTS_TABLE, { PK: householdId, SK: accountId });
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
      source: s.source,
    })),
  });
}

exports.handler = async (event) => {
  const { householdId } = getHouseholdContext(event);
  const accountId = event.pathParameters?.accountId;
  const method = event.requestContext?.http?.method || 'GET';

  if (method === 'POST') {
    const body = parseBody(event);
    if (!body) return badRequest('Invalid JSON body');
    return createAccount(householdId, body);
  }

  if (method === 'PUT') {
    if (!accountId) return badRequest('accountId is required');
    const body = parseBody(event);
    if (!body) return badRequest('Invalid JSON body');
    return updateAccount(householdId, accountId, body);
  }

  if (method === 'DELETE') {
    if (!accountId) return badRequest('accountId is required');
    const existing = await get(ACCOUNTS_TABLE, { PK: householdId, SK: accountId });
    if (!existing) return notFound('Account not found');
    await del(ACCOUNTS_TABLE, { PK: householdId, SK: accountId });
    return noContent();
  }

  if (accountId) return getAccountWithHistory(householdId, accountId);

  const accounts = await queryByPK(ACCOUNTS_TABLE, householdId);
  return ok({ accounts: accounts.filter((a) => a.isActive !== false).map(toPublicAccount) });
};
