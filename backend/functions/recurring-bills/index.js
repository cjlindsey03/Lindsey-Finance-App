const { randomUUID } = require('crypto');
const { queryByPK, get, put, del } = require('../../shared/db');
const { getHouseholdContext } = require('../../shared/auth');
const { ok, badRequest, notFound, noContent, parseBody } = require('../../shared/http');

const RECURRING_BILLS_TABLE = process.env.RECURRING_BILLS_TABLE;

const toPublicBill = ({ PK, SK, ...rest }) => ({ billId: SK, ...rest });

async function listBills(householdId) {
  const bills = await queryByPK(RECURRING_BILLS_TABLE, householdId);
  bills.sort((a, b) => (a.dayOfMonth ?? 0) - (b.dayOfMonth ?? 0));
  return ok({ bills: bills.map(toPublicBill) });
}

async function createBill(householdId, body) {
  if (!body?.description || !body?.category || typeof body.amount !== 'number' || !body.dayOfMonth) {
    return badRequest('description, category, amount, and dayOfMonth are required');
  }

  const bill = {
    PK: householdId,
    SK: randomUUID(),
    description: body.description,
    category: body.category,
    amount: body.amount,
    dayOfMonth: Number(body.dayOfMonth),
    type: body.type ?? (body.amount >= 0 ? 'income' : 'bill'),
    isActive: body.isActive ?? true,
  };
  await put(RECURRING_BILLS_TABLE, bill);
  return ok({ bill: toPublicBill(bill) });
}

async function updateBill(householdId, billId, body) {
  const existing = await get(RECURRING_BILLS_TABLE, { PK: householdId, SK: billId });
  if (!existing) return notFound('Bill not found');

  const updated = { ...existing, ...body, PK: householdId, SK: billId };
  await put(RECURRING_BILLS_TABLE, updated);
  return ok({ bill: toPublicBill(updated) });
}

exports.handler = async (event) => {
  const { householdId } = getHouseholdContext(event);
  const method = event.requestContext?.http?.method || 'GET';
  const billId = event.pathParameters?.billId;

  if (method === 'GET') return listBills(householdId);

  const body = parseBody(event);
  if (method !== 'DELETE' && !body) return badRequest('Invalid JSON body');

  if (method === 'POST') return createBill(householdId, body);

  if (!billId) return badRequest('billId is required');
  if (method === 'PUT') return updateBill(householdId, billId, body);
  if (method === 'DELETE') {
    await del(RECURRING_BILLS_TABLE, { PK: householdId, SK: billId });
    return noContent();
  }

  return badRequest(`Unsupported method ${method}`);
};
