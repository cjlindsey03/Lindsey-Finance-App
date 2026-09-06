const { randomUUID } = require('crypto');
const { queryByPK, put, del } = require('../../shared/db');
const { getHouseholdContext } = require('../../shared/auth');
const { ok, badRequest, noContent, parseBody } = require('../../shared/http');

const CASHFLOW_EVENTS_TABLE = process.env.CASHFLOW_EVENTS_TABLE;
const RECURRING_BILLS_TABLE = process.env.RECURRING_BILLS_TABLE;

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

// This is a net-flow analyzer, not a bank balance: the cumulative line starts
// at zero and answers "does this month's income cover this month's bills, and
// where is it tightest?" — deliberately independent of any account balance.
async function getMonth(householdId, year, month) {
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  const daysThisMonth = daysInMonth(year, month);

  const [oneOffEvents, bills] = await Promise.all([
    queryByPK(CASHFLOW_EVENTS_TABLE, householdId),
    queryByPK(RECURRING_BILLS_TABLE, householdId),
  ]);

  const projectedBills = bills
    .filter((b) => b.isActive !== false)
    .map((b) => {
      const day = String(Math.min(b.dayOfMonth ?? 1, daysThisMonth)).padStart(2, '0');
      return {
        eventDate: `${monthPrefix}-${day}`,
        eventId: b.SK,
        type: b.type,
        description: b.description,
        amount: b.amount,
        accountId: null,
        source: 'recurring',
        isRecurring: true,
        isPCSRelated: false,
      };
    });

  const events = [...oneOffEvents.filter((e) => e.eventDate?.startsWith(monthPrefix)), ...projectedBills].sort(
    (a, b) => a.eventDate.localeCompare(b.eventDate)
  );

  const dailyNetPosition = {};
  const negativeDays = [];
  let running = 0;
  let totalIncome = 0;
  let totalBills = 0;

  for (let day = 1; day <= daysThisMonth; day++) {
    const date = `${monthPrefix}-${String(day).padStart(2, '0')}`;
    for (const event of events.filter((e) => e.eventDate === date)) {
      running += event.amount;
      if (event.amount >= 0) totalIncome += event.amount;
      else totalBills += event.amount;
    }
    dailyNetPosition[date] = Math.round(running * 100) / 100;
    if (running < 0) negativeDays.push(date);
  }

  const entries = Object.entries(dailyNetPosition);
  const lowest = entries.reduce((min, cur) => (cur[1] < min[1] ? cur : min), entries[0]);

  return ok({
    events: events.map(({ PK, SK, ...rest }) => rest),
    dailyNetPosition,
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalBills: Math.round(totalBills * 100) / 100,
    netFlow: Math.round(running * 100) / 100,
    lowestPointDate: lowest?.[0] ?? null,
    lowestNetPosition: lowest?.[1] ?? null,
    negativeDays,
  });
}

async function createEvent(householdId, body) {
  if (!body?.eventDate || typeof body.amount !== 'number') {
    return badRequest('eventDate and numeric amount are required');
  }

  const eventId = randomUUID();
  const event = {
    PK: householdId,
    SK: `${body.eventDate}#${eventId}`,
    eventId,
    eventDate: body.eventDate,
    type: body.type ?? 'other',
    description: body.description ?? '',
    amount: body.amount,
    accountId: body.accountId ?? null,
    // Manual events are always one-off — recurring items live in
    // recurring_bills and are managed on the Recurring Bills page instead.
    source: 'manual',
    isPCSRelated: body.isPCSRelated ?? false,
  };
  await put(CASHFLOW_EVENTS_TABLE, event);

  const { PK, SK, ...rest } = event;
  return ok({ event: rest });
}

async function deleteEvent(householdId, eventId) {
  const events = await queryByPK(CASHFLOW_EVENTS_TABLE, householdId);
  const target = events.find((e) => e.eventId === eventId);
  if (!target) return badRequest('Event not found');

  await del(CASHFLOW_EVENTS_TABLE, { PK: householdId, SK: target.SK });
  return noContent();
}

exports.handler = async (event) => {
  const { householdId } = getHouseholdContext(event);
  const method = event.requestContext?.http?.method || 'GET';
  const { year, month, eventId } = event.pathParameters || {};

  if (method === 'POST') {
    const body = parseBody(event);
    if (!body) return badRequest('Invalid JSON body');
    return createEvent(householdId, body);
  }

  if (method === 'DELETE') {
    if (!eventId) return badRequest('eventId is required');
    return deleteEvent(householdId, eventId);
  }

  if (!year || !month) return badRequest('year and month are required');
  return getMonth(householdId, Number(year), Number(month));
};
