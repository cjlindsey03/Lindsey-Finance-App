const { randomUUID } = require('crypto');
const { queryByPK, put, del } = require('../../shared/db');
const { getHouseholdContext } = require('../../shared/auth');
const { ok, badRequest, noContent, parseBody } = require('../../shared/http');

const CASHFLOW_EVENTS_TABLE = process.env.CASHFLOW_EVENTS_TABLE;
const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE;

// The running balance starts from the live Plaid balance of the household's
// checking account rather than a manually entered figure.
async function getStartingBalance(householdId) {
  const accounts = await queryByPK(ACCOUNTS_TABLE, householdId);
  const checking = accounts.find(
    (a) => a.subtype === 'checking' || a.type === 'checking'
  );
  return checking?.currentBalance ?? 0;
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

async function getMonth(householdId, year, month) {
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  const allEvents = await queryByPK(CASHFLOW_EVENTS_TABLE, householdId);

  const events = allEvents
    .filter((e) => e.eventDate?.startsWith(monthPrefix) || e.isRecurring)
    .map((e) => {
      if (!e.isRecurring || e.eventDate?.startsWith(monthPrefix)) return e;
      // Project a recurring bill into the requested month.
      const day = String(e.recurringDayOfMonth ?? 1).padStart(2, '0');
      return { ...e, eventDate: `${monthPrefix}-${day}` };
    })
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));

  const startingBalance = await getStartingBalance(householdId);
  const dailyRunningBalance = {};
  const negativeDays = [];
  let running = startingBalance;

  for (let day = 1; day <= daysInMonth(year, month); day++) {
    const date = `${monthPrefix}-${String(day).padStart(2, '0')}`;
    for (const event of events.filter((e) => e.eventDate === date)) {
      running += event.amount;
    }
    dailyRunningBalance[date] = Math.round(running * 100) / 100;
    if (running < 0) negativeDays.push(date);
  }

  const entries = Object.entries(dailyRunningBalance);
  const lowest = entries.reduce((min, cur) => (cur[1] < min[1] ? cur : min), entries[0]);

  return ok({
    startingBalance,
    events: events.map(({ PK, SK, ...rest }) => rest),
    dailyRunningBalance,
    lowestPointDate: lowest?.[0] ?? null,
    lowestPointBalance: lowest?.[1] ?? null,
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
    source: 'manual',
    isRecurring: body.isRecurring ?? false,
    recurringDayOfMonth: body.recurringDayOfMonth ?? null,
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
  if (target.source !== 'manual') return badRequest('Only manually added events can be deleted');

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
