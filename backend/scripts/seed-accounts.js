// Seeds the household's accounts, recurring bills, and a starter committed
// spending plan. Every account is hand-maintained; balances move when a
// spending plan is committed or edited in Settings.
// Usage: node scripts/seed-accounts.js [--local]
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const local = process.argv.includes('--local');
const HOUSEHOLD_ID = 'lindsey-001';

const client = new DynamoDBClient({
  region: local ? 'us-east-1' : process.env.AWS_REGION || 'us-west-1',
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
  // Deposit accounts.
  { id: 'manual_joint_savings', name: 'Joint Savings', type: 'savings', subtype: 'savings',
    currentBalance: 1000, isG1Target: false },
  { id: 'manual_joint_checking', name: 'Joint Checking', type: 'checking', subtype: 'checking',
    currentBalance: 0, isG1Target: false },
];

// Recurring Bills — the single source of truth the cashflow projection and
// Spending Plan auto-fill both read from (see backend/functions/recurring-bills).
const RECURRING_BILLS = [
  { id: 'victoria_pay_1', desc: 'Victoria pay', category: 'Income', amount: 2098.84, day: 1, type: 'income' },
  { id: 'victoria_pay_15', desc: 'Victoria pay', category: 'Income', amount: 2098.84, day: 15, type: 'income' },
  // CJ's semi-monthly net, from the Aug 2026 LES forecasted pay lines.
  { id: 'cj_pay_1', desc: 'CJ pay', category: 'Income', amount: 1803.66, day: 1, type: 'income' },
  { id: 'cj_pay_15', desc: 'CJ pay', category: 'Income', amount: 1803.66, day: 15, type: 'income' },
  { id: 'spectrum_internet', desc: 'Spectrum internet', category: 'Internet', amount: -80, day: 5, type: 'bill' },
  { id: 'tmobile_cj', desc: 'T-Mobile (CJ)', category: 'Phone', amount: -206, day: 24, type: 'bill' },
  { id: 'tmobile_victoria', desc: 'T-Mobile (Victoria)', category: 'Phone', amount: -140, day: 24, type: 'bill' },
  { id: 'storage_unit', desc: 'Storage unit', category: 'Childcare_Storage', amount: -95, day: 1, type: 'bill' },
  { id: 'childcare_1', desc: 'Childcare', category: 'Childcare', amount: -300, day: 1, type: 'bill' },
  { id: 'childcare_15', desc: 'Childcare', category: 'Childcare', amount: -300, day: 15, type: 'bill' },
  { id: 'career_starter_payment', desc: 'Career Starter Loan payment', category: 'Debt_Payment', amount: -461.39, day: 15, type: 'bill' },
  { id: 'ally_payment', desc: 'Ally auto payment', category: 'Debt_Payment', amount: -334.82, day: 19, type: 'bill' },
  { id: 'exeter_payment', desc: 'Exeter auto payment', category: 'Debt_Payment', amount: -367.73, day: 26, type: 'bill' },
  { id: 'affirm_payment', desc: 'Affirm payment', category: 'Debt_Payment', amount: -84.17, day: 10, type: 'bill' },
];

// Starter plan for the 2026-09-15 pay period, with allocations pre-summed
// from the bills above the same way the frontend's auto-fill will compute
// them (bills with day 15-28 land in this period).
const STARTER_PLAN = {
  planId: 'starter-2026-09-15',
  periodKey: '2026-09-15',
  periodStart: '2026-09-15',
  periodEnd: '2026-09-30',
  label: 'Sep 15 Plan',
  income: 2098.84,
  allocations: { Phone: 346, Childcare: 300, Debt_Payment: 1163.94 },
  g1Extra: 0,
  g2Allocation: 250,
  notes: 'Seeded starter plan — adjust allocations and goals to match reality.',
};

async function scanAll(tableName) {
  let items = [];
  let ExclusiveStartKey;
  do {
    const result = await doc.send(new ScanCommand({ TableName: tableName, ExclusiveStartKey }));
    items = items.concat(result.Items ?? []);
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

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
        isActive: true,
      },
    }));
  }
  console.log(`seeded ${ACCOUNTS.length} accounts`);

  for (const b of RECURRING_BILLS) {
    await doc.send(new PutCommand({
      TableName: 'recurring_bills',
      Item: {
        PK: HOUSEHOLD_ID, SK: b.id,
        description: b.desc, category: b.category, amount: b.amount,
        dayOfMonth: b.day, type: b.type, isActive: true,
      },
    }));
  }
  console.log(`seeded ${RECURRING_BILLS.length} recurring bills`);

  // Clean up rows left behind by earlier versions: the recurring#* templates
  // that predate the recurring_bills table, the fake sandbox accounts Plaid
  // created, and Plaid's predicted-payment cashflow events (which the old
  // delete guard made unremovable through the API).
  const cashflowEvents = await scanAll('cashflow_events');
  const staleEvents = cashflowEvents.filter(
    (e) => (typeof e.SK === 'string' && e.SK.startsWith('recurring#')) || e.source === 'plaid'
  );
  for (const row of staleEvents) {
    await doc.send(new DeleteCommand({ TableName: 'cashflow_events', Key: { PK: row.PK, SK: row.SK } }));
  }
  if (staleEvents.length) console.log(`removed ${staleEvents.length} stale rows from cashflow_events`);

  // Plans written before drafts existed have no `status`, so the API can no
  // longer see them — remove them rather than leaving invisible rows behind.
  const allPlans = await scanAll('spending_plans');
  const legacyPlans = allPlans.filter((p) => !p.status);
  for (const row of legacyPlans) {
    await doc.send(new DeleteCommand({ TableName: 'spending_plans', Key: { PK: row.PK, SK: row.SK } }));
  }
  if (legacyPlans.length) console.log(`removed ${legacyPlans.length} pre-draft spending plan rows`);

  const allAccounts = await scanAll('accounts');
  const plaidAccounts = allAccounts.filter(
    (a) => a.isManual === false || (typeof a.name === 'string' && a.name.startsWith('Plaid '))
  );
  for (const row of plaidAccounts) {
    await doc.send(new DeleteCommand({ TableName: 'accounts', Key: { PK: row.PK, SK: row.SK } }));
  }
  if (plaidAccounts.length) console.log(`removed ${plaidAccounts.length} Plaid-created accounts`);

  await doc.send(new PutCommand({
    TableName: 'g2_tracker',
    Item: { PK: HOUSEHOLD_ID, targetAmount: 1500, savingsAccountId: 'manual_joint_savings',
            monthlyContribution: 500, pcsDate: '2026-12-15', notes: '', updatedAt: new Date().toISOString() },
  }));
  console.log('seeded G2 tracker');

  const now = new Date().toISOString();
  await doc.send(new PutCommand({
    TableName: 'spending_plans',
    Item: {
      PK: HOUSEHOLD_ID, SK: STARTER_PLAN.planId,
      status: 'committed',
      periodKey: STARTER_PLAN.periodKey,
      periodStart: STARTER_PLAN.periodStart,
      periodEnd: STARTER_PLAN.periodEnd,
      label: STARTER_PLAN.label, income: STARTER_PLAN.income, allocations: STARTER_PLAN.allocations,
      notes: STARTER_PLAN.notes, g1Extra: STARTER_PLAN.g1Extra, g2Allocation: STARTER_PLAN.g2Allocation,
      // Matches scorePlan() in backend/functions/spending-plans/index.js:
      // debt (1163.94+0)/2098.84=55.5%, savings 250/2098.84=11.9%, combined 67.4% -> A.
      score: 'A',
      scoreBreakdown: {
        debtContributionPct: 55.5, savingsContributionPct: 11.9, combinedPct: 67.4,
        nextGrade: null, amountToNextGrade: null,
      },
      accountPayments: {}, savingsAmount: 0,
      committedAt: now, createdAt: now, updatedAt: now,
    },
  }));
  console.log(`seeded starter spending plan for ${STARTER_PLAN.periodKey}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
