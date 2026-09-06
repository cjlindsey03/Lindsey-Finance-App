// Seeds the household's known accounts and recurring bills as manual records,
// so the trackers work before Plaid is connected. Plaid-linked accounts
// replace these once each institution is linked.
// Usage: node scripts/seed-accounts.js [--local]
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const local = process.argv.includes('--local');
const HOUSEHOLD_ID = 'lindsey-001';

const client = new DynamoDBClient({
  region: 'us-east-1',
  ...(local
    ? { endpoint: 'http://localhost:8000', credentials: { accessKeyId: 'local', secretAccessKey: 'local' } }
    : {}),
});
const doc = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });

const ACCOUNTS = [
  // Revolving — G1 snowball targets, ordered smallest balance first.
  { id: 'manual_navyfed_platinum', name: 'Navy Fed Visa Platinum', type: 'credit', subtype: 'credit card',
    currentBalance: 24.57, creditLimit: 500, apr: 0, statementCloseDay: 5, isG1Target: true, g1Order: 1 },
  { id: 'manual_capitalone_platinum', name: 'Capital One Platinum', type: 'credit', subtype: 'credit card',
    currentBalance: 401.85, creditLimit: 1500, apr: 28.99, statementCloseDay: 9, isG1Target: true, g1Order: 2 },
  { id: 'manual_affirm', name: 'Affirm', type: 'bnpl', subtype: 'bnpl',
    currentBalance: 504.13, creditLimit: null, apr: 35.97, minimumPayment: 84.17, isG1Target: true, g1Order: 3 },
  { id: 'manual_navyfed_amex', name: 'Navy Fed More Rewards Amex', type: 'credit', subtype: 'credit card',
    currentBalance: 684, creditLimit: 1000, apr: 18, statementCloseDay: 7, isG1Target: true, g1Order: 4 },
  { id: 'manual_navyfed_cashrewards', name: 'Navy Fed cashRewards Plus', type: 'credit', subtype: 'credit card',
    currentBalance: 10394.96, creditLimit: 11000, apr: 18, statementCloseDay: 10, isG1Target: true, g1Order: 5 },
  // Zero-balance cards: kept for utilization math, not snowball targets.
  { id: 'manual_bofa', name: 'Bank of America', type: 'credit', subtype: 'credit card',
    currentBalance: 0, creditLimit: 700, apr: 24, statementCloseDay: 10, isG1Target: false },
  { id: 'manual_discover', name: 'Discover', type: 'credit', subtype: 'credit card',
    currentBalance: 0, creditLimit: 1800, apr: 18, statementCloseDay: 10, isG1Target: false },
  // Installment loans — tracked, but not part of the revolving snowball.
  { id: 'manual_exeter', name: 'Exeter Auto Loan (joint)', type: 'loan', subtype: 'auto',
    currentBalance: 14600.51, apr: 6, minimumPayment: 367.73, dueDay: 26, isG1Target: false },
  { id: 'manual_ally', name: 'Ally Auto Loan (Victoria)', type: 'loan', subtype: 'auto',
    currentBalance: 12013.61, apr: 19.59, minimumPayment: 334.82, dueDay: 19, isG1Target: false },
  { id: 'manual_career_starter', name: 'Navy Fed Career Starter Loan', type: 'loan', subtype: 'personal',
    currentBalance: 22473.91, apr: 2.99, minimumPayment: 461.39, dueDay: 15, isG1Target: false },
  // Deposit accounts. Checking balance is replaced by Plaid once linked.
  { id: 'manual_joint_savings', name: 'Joint Savings', type: 'savings', subtype: 'savings',
    currentBalance: 1000, isG1Target: false },
  { id: 'manual_joint_checking', name: 'Joint Checking', type: 'checking', subtype: 'checking',
    currentBalance: 0, isG1Target: false },
];

const RECURRING = [
  { desc: 'Victoria pay', amount: 2098.84, day: 1, type: 'income' },
  { desc: 'Victoria pay', amount: 2098.84, day: 15, type: 'income' },
  { desc: 'Spectrum internet', amount: -80, day: 5, type: 'bill' },
  { desc: 'T-Mobile (CJ)', amount: -206, day: 24, type: 'bill' },
  { desc: 'T-Mobile (Victoria)', amount: -140, day: 24, type: 'bill' },
  { desc: 'Storage unit', amount: -95, day: 1, type: 'bill' },
  { desc: 'Childcare', amount: -300, day: 1, type: 'bill' },
  { desc: 'Childcare', amount: -300, day: 15, type: 'bill' },
  { desc: 'Career Starter Loan payment', amount: -461.39, day: 15, type: 'loan_payment' },
  { desc: 'Ally auto payment', amount: -334.82, day: 19, type: 'loan_payment' },
  { desc: 'Exeter auto payment', amount: -367.73, day: 26, type: 'loan_payment' },
  { desc: 'Affirm payment', amount: -84.17, day: 10, type: 'loan_payment' },
];

async function main() {
  for (const a of ACCOUNTS) {
    await doc.send(new PutCommand({
      TableName: 'accounts',
      Item: {
        PK: HOUSEHOLD_ID, SK: a.id, name: a.name, type: a.type, subtype: a.subtype,
        currentBalance: a.currentBalance, availableBalance: null,
        creditLimit: a.creditLimit ?? null, apr: a.apr ?? null,
        minimumPayment: a.minimumPayment ?? null,
        statementCloseDay: a.statementCloseDay ?? null, dueDay: a.dueDay ?? null,
        isG1Target: a.isG1Target, g1Order: a.g1Order ?? null,
        isActive: true, isManual: true, lastSynced: null,
      },
    }));
  }
  console.log(`seeded ${ACCOUNTS.length} accounts`);

  for (const r of RECURRING) {
    const eventId = `recurring_${r.desc.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${r.day}`;
    await doc.send(new PutCommand({
      TableName: 'cashflow_events',
      Item: {
        // eventDate is omitted, not null: it is a GSI key, and the recurring
        // row is a template that the cashflow Lambda projects into each month.
        PK: HOUSEHOLD_ID, SK: `recurring#${eventId}`, eventId,
        type: r.type, description: r.desc, amount: r.amount,
        accountId: null, source: 'recurring', isRecurring: true,
        recurringDayOfMonth: r.day, isPCSRelated: false,
      },
    }));
  }
  console.log(`seeded ${RECURRING.length} recurring cashflow events`);

  await doc.send(new PutCommand({
    TableName: 'g2_tracker',
    Item: { PK: HOUSEHOLD_ID, targetAmount: 12000, savingsAccountId: 'manual_joint_savings',
            monthlyContribution: 500, pcsDate: '2026-12-15', notes: '', updatedAt: new Date().toISOString() },
  }));
  console.log('seeded G2 tracker');
}

main().catch((e) => { console.error(e); process.exit(1); });
