const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { queryByPK, del } = require('../../shared/db');
const { currentPeriod } = require('../../shared/payPeriod');

const CASHFLOW_EVENTS_TABLE = process.env.CASHFLOW_EVENTS_TABLE;
const RECURRING_BILLS_TABLE = process.env.RECURRING_BILLS_TABLE;
const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE;
const SPENDING_PLANS_TABLE = process.env.SPENDING_PLANS_TABLE;
const REMINDERS_TOPIC_ARN = process.env.REMINDERS_TOPIC_ARN;

const HOUSEHOLD_ID = 'lindsey-001';
const NOTIFY_DAYS_AHEAD = [1, 3];

const sns = new SNSClient({});

function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// A failed SMS must not abort the run — the draft purge below still needs to
// happen, and one bad publish shouldn't cost us the whole daily job.
async function publish(message) {
  try {
    await sns.send(new PublishCommand({ Message: message, TopicArn: REMINDERS_TOPIC_ARN }));
    return true;
  } catch (err) {
    console.error('SNS publish failed:', err.message);
    return false;
  }
}

exports.handler = async () => {
  const sent = [];

  // Regular bills live in recurring_bills (matched on day-of-month);
  // cashflow_events only holds one-off entries.
  const [events, bills] = await Promise.all([
    queryByPK(CASHFLOW_EVENTS_TABLE, HOUSEHOLD_ID),
    queryByPK(RECURRING_BILLS_TABLE, HOUSEHOLD_ID),
  ]);

  for (const daysUntil of NOTIFY_DAYS_AHEAD) {
    const targetDate = isoDate(daysUntil);
    const targetDay = new Date(`${targetDate}T00:00:00`).getDate();

    const due = [
      ...events.filter((e) => e.eventDate === targetDate && e.amount < 0),
      ...bills.filter((b) => b.isActive !== false && b.amount < 0 && b.dayOfMonth === targetDay),
    ];

    for (const item of due) {
      const message = `Upcoming: ${item.description} — $${Math.abs(item.amount).toFixed(2)} due in ${daysUntil} day(s)`;
      if (await publish(message)) sent.push(message);
    }
  }

  const accounts = await queryByPK(ACCOUNTS_TABLE, HOUSEHOLD_ID);
  for (const daysUntil of NOTIFY_DAYS_AHEAD) {
    const closeDay = new Date(isoDate(daysUntil)).getDate();
    for (const card of accounts.filter((a) => a.statementCloseDay === closeDay && a.creditLimit > 0)) {
      const message = `${card.name} statement closes in ${daysUntil} day(s). Check utilization before it posts.`;
      if (await publish(message)) sent.push(message);
    }
  }

  // Drafts are scratch work for a single pay period — once the period rolls
  // over they're clutter. Committed plans are history and always kept.
  const { periodKey } = currentPeriod();
  const plans = await queryByPK(SPENDING_PLANS_TABLE, HOUSEHOLD_ID);
  const staleDrafts = plans.filter((p) => p.status === 'draft' && (p.periodKey ?? '') < periodKey);
  for (const draft of staleDrafts) {
    await del(SPENDING_PLANS_TABLE, { PK: draft.PK, SK: draft.SK });
  }

  return { sentCount: sent.length, sent, purgedDrafts: staleDrafts.length };
};
