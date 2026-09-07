// One-off migration, safe to re-run:
//   1. Re-files bills into the reworked category list (car notes get their own
//      line; the storage unit folds into Other).
//   2. Stamps each G1 account with the baseline the payoff is measured against
//      — "every credit card maxed out", so a card's baseline is its limit.
//      Accounts with no limit keep their current balance as the starting point.
//
// Run: node scripts/migrate-categories-and-baseline.js [--apply]
// Without --apply it prints what it would change and writes nothing.

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || 'us-west-1' }));
const APPLY = process.argv.includes('--apply');

// Keyed by bill description — the ids differ between seeded and hand-added rows.
const BILL_RECATEGORIES = {
  'Storage unit': 'Other',
  'Ally auto payment': 'Car_Payment',
  'Exeter auto payment': 'Car_Payment',
};

async function scanAll(TableName) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await doc.send(new ScanCommand({ TableName, ExclusiveStartKey }));
    items.push(...(res.Items ?? []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function migrateBills() {
  const bills = await scanAll('recurring_bills');
  let changed = 0;

  for (const bill of bills) {
    const target = BILL_RECATEGORIES[bill.description];
    if (!target || bill.category === target) continue;

    console.log(`  ${bill.description}: ${bill.category} -> ${target}`);
    changed++;
    if (!APPLY) continue;

    await doc.send(
      new UpdateCommand({
        TableName: 'recurring_bills',
        Key: { PK: bill.PK, SK: bill.SK },
        UpdateExpression: 'SET category = :c',
        ExpressionAttributeValues: { ':c': target },
      })
    );
  }
  return changed;
}

async function backfillBaselines() {
  const accounts = await scanAll('accounts');
  let changed = 0;

  for (const account of accounts) {
    if (!account.isG1Target || account.g1Baseline != null) continue;

    const baseline = account.creditLimit > 0 ? account.creditLimit : account.currentBalance ?? 0;
    console.log(
      `  ${account.name}: baseline ${baseline}` +
        (account.creditLimit > 0 ? ' (credit limit — maxed out)' : ' (current balance — no limit)')
    );
    changed++;
    if (!APPLY) continue;

    await doc.send(
      new UpdateCommand({
        TableName: 'accounts',
        Key: { PK: account.PK, SK: account.SK },
        UpdateExpression: 'SET g1Baseline = :b',
        ExpressionAttributeValues: { ':b': baseline },
      })
    );
  }
  return changed;
}

async function main() {
  console.log(APPLY ? 'APPLYING changes\n' : 'DRY RUN — pass --apply to write\n');

  console.log('Recurring bills:');
  const bills = await migrateBills();
  if (!bills) console.log('  (nothing to change)');

  console.log('\nG1 baselines:');
  const baselines = await backfillBaselines();
  if (!baselines) console.log('  (nothing to change)');

  console.log(`\n${bills} bill(s), ${baselines} account(s)${APPLY ? ' updated' : ' would change'}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
