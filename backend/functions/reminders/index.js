const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { queryByPK } = require('../../shared/db');

const CASHFLOW_EVENTS_TABLE = process.env.CASHFLOW_EVENTS_TABLE;
const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE;
const REMINDERS_TOPIC_ARN = process.env.REMINDERS_TOPIC_ARN;

const HOUSEHOLD_ID = 'lindsey-001';
const NOTIFY_DAYS_AHEAD = [1, 3];

const sns = new SNSClient({});

function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function publish(message) {
  await sns.send(new PublishCommand({ Message: message, TopicArn: REMINDERS_TOPIC_ARN }));
}

exports.handler = async () => {
  const sent = [];

  const events = await queryByPK(CASHFLOW_EVENTS_TABLE, HOUSEHOLD_ID);
  for (const daysUntil of NOTIFY_DAYS_AHEAD) {
    const targetDate = isoDate(daysUntil);
    for (const event of events.filter((e) => e.eventDate === targetDate && e.amount < 0)) {
      const message = `Upcoming: ${event.description} — $${Math.abs(event.amount).toFixed(2)} due in ${daysUntil} day(s)`;
      await publish(message);
      sent.push(message);
    }
  }

  const accounts = await queryByPK(ACCOUNTS_TABLE, HOUSEHOLD_ID);
  for (const daysUntil of NOTIFY_DAYS_AHEAD) {
    const closeDay = new Date(isoDate(daysUntil)).getDate();
    for (const card of accounts.filter((a) => a.statementCloseDay === closeDay && a.creditLimit > 0)) {
      const message = `${card.name} statement closes in ${daysUntil} day(s). Check utilization before it posts.`;
      await publish(message);
      sent.push(message);
    }
  }

  return { sentCount: sent.length, sent };
};
