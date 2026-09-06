This is a draft and not an absolute fixed document, this document can be updated by Claude Code whenever I make decisions to go in another direction while creating this app.

# Household Financial Dashboard — Claude Code Build Spec

**Version 2.0 | 09/05/2026 | Technical spec only — no design elements**

---

## Scope

Two-user household financial dashboard (CJ + Victoria). React SPA hosted on AWS. Plaid Core tier for live bank/card data. All costs must stay near-zero (AWS free tier + ~$3–8/month Plaid). No Claude API. No DTI calculator. No net worth tracker. No income verification.

**In scope:**

- Plaid link + automated daily balance snapshots
- Transaction pull with user-defined categorization rules
- Upcoming payment prediction (per card)
- Cashflow calendar (Plaid auto-populated + manual events)
- G1 snowball debt tracker
- G2 PCS fund tracker
- G3 credit utilization tracker (manual FICO input + Plaid-derived utilization)
- Spending plan versioning by pay date
- PCS Profit Simulator (form-based, saved runs)
- Shared PCS task checklist
- Rental listings (RentCast API proxy)
- Data export (copy-to-clipboard prompt for external Claude chat)

**Out of scope:** DTI calculator, net worth tracker, income verification, Claude API, chart styling decisions.

---

## Tech Stack

|Layer|Technology|
|---|---|
|Frontend|React 18 (Vite), React Router v6, TanStack Query v5, AWS Amplify SDK v6|
|Auth|AWS Cognito (User Pool, 2 users: cj, victoria)|
|API|AWS API Gateway (HTTP API) + Lambda (Node.js 20.x)|
|Database|AWS DynamoDB (single-table or multi-table per spec below)|
|Storage|AWS S3 + CloudFront (SPA hosting)|
|Scheduling|AWS EventBridge Scheduler|
|Notifications|AWS SNS (SMS to CJ + Victoria)|
|Bank Data|Plaid Node.js SDK (Core tier)|
|External APIs|RentCast, EIA (gas prices), GSA Per Diem|

---

## Project Structure

```
/
├── frontend/
│   ├── src/
│   │   ├── api/              # TanStack Query hooks + fetch wrappers
│   │   ├── components/       # Reusable components
│   │   ├── pages/            # One file per route
│   │   ├── context/          # AuthContext, HouseholdContext
│   │   ├── utils/            # Calculation functions (snowball, PPM, scoring)
│   │   └── constants/        # Category list, MALT rates, M&IE rates, static data
│   └── vite.config.js
│
└── backend/
    ├── functions/
    │   ├── plaid-link-create/
    │   ├── plaid-exchange-token/
    │   ├── plaid-sync/           # Runs daily via EventBridge
    │   ├── accounts/
    │   ├── transactions/
    │   ├── category-rules/
    │   ├── spending-plans/
    │   ├── cashflow/
    │   ├── g1-tracker/
    │   ├── g2-tracker/
    │   ├── g3-tracker/
    │   ├── pcs-simulator/
    │   ├── tasks/
    │   ├── rentals-proxy/
    │   └── reminders/
    ├── shared/
    │   └── db.js             # DynamoDB client + helper functions
    └── template.yaml         # SAM or CDK deployment
```

---

## Cognito Setup

- **User Pool:** `household-pool`
- **Users:** `cj` (primary), `victoria` (secondary)
- **Custom attribute:** `householdId` (string, same value for both users: `"lindsey-001"`)
- **App client:** No client secret (SPA)
- **Auth flow:** `USER_SRP_AUTH`
- All API Gateway routes are protected via Cognito authorizer. Lambda functions read `householdId` from the JWT claims — never from the request body.

---

## DynamoDB Tables

### Table: `accounts`

Stores all financial accounts (Plaid-connected and manual).

|Attribute|Type|Notes|
|---|---|---|
|`PK`|String|`householdId` (e.g. `"lindsey-001"`)|
|`SK`|String|`accountId` (e.g. `"plaid_acct_abc123"` or `"manual_exeter"`)|
|`plaidAccountId`|String|Plaid's account ID, null if manual|
|`plaidItemId`|String|Plaid item (institution connection), null if manual|
|`name`|String|Display name (user-editable)|
|`officialName`|String|Bank's name for account|
|`type`|String|`checking`, `savings`, `credit`, `loan`, `bnpl`|
|`subtype`|String|Plaid subtype (credit card, auto, etc.)|
|`currentBalance`|Number|Latest balance|
|`availableBalance`|Number|Available credit/funds|
|`creditLimit`|Number|Credit limit (null if not revolving)|
|`apr`|Number|APR % (manual entry)|
|`minimumPayment`|Number|Known minimum (manual; updated by prediction)|
|`statementCloseDay`|Number|Day of month statement closes|
|`dueDay`|Number|Payment due day of month|
|`isG1Target`|Boolean|Include in G1 snowball|
|`g1Order`|Number|Snowball position (1 = pay first)|
|`isActive`|Boolean|Show/hide in UI|
|`isManual`|Boolean|False = Plaid-connected|
|`lastSynced`|String|ISO timestamp of last Plaid pull|

**GSI:** `plaidAccountId-index` on `plaidAccountId` for Plaid sync lookups.

---

### Table: `plaid_items`

Stores Plaid access tokens per connected institution.

|Attribute|Type|Notes|
|---|---|---|
|`PK`|String|`householdId`|
|`SK`|String|`itemId` (Plaid's item ID)|
|`accessToken`|String|**Encrypted at rest (DynamoDB SSE on).** Never log, never return to frontend.|
|`institutionId`|String|Plaid institution ID|
|`institutionName`|String|Display name|
|`status`|String|`active`, `error`, `needs_reauth`|
|`lastSync`|String|ISO timestamp|
|`error`|Map|Plaid error object if status is `error`|

---

### Table: `balance_snapshots`

Daily balance history per account.

|Attribute|Type|Notes|
|---|---|---|
|`PK`|String|`accountId`|
|`SK`|String|`snapshotDate` (ISO date: `"2026-09-05"`)|
|`balance`|Number||
|`available`|Number||
|`limit`|Number|Credit limit at time of snapshot|
|`utilization`|Number|`balance / limit * 100` (null if not revolving)|
|`householdId`|String|For GSI access|
|`source`|String|`plaid` or `manual`|

**TTL:** Not set — keep full history for G3 trend chart.

---

### Table: `transactions`

Pulled from Plaid, stored with user-applied categories.

|Attribute|Type|Notes|
|---|---|---|
|`PK`|String|`householdId`|
|`SK`|String|`transactionId` (Plaid's ID)|
|`accountId`|String|FK to accounts table|
|`date`|String|ISO date|
|`amount`|Number|Positive = debit, negative = credit|
|`merchantName`|String|Cleaned merchant name from Plaid|
|`description`|String|Raw transaction description|
|`plaidCategory`|List|Plaid's category array|
|`plaidCategoryId`|String|Plaid category ID|
|`resolvedCategory`|String|Final category after rules engine|
|`resolvedSubcategory`|String|Optional subcategory|
|`matchedRuleId`|String|Which rule resolved the category (null = Plaid default)|
|`isIncome`|Boolean|True if this is a pay deposit|
|`isTransfer`|Boolean|True if account-to-account transfer|
|`isManuallyRecategorized`|Boolean|User manually overrode the rule|
|`memo`|String|User note|
|`pending`|Boolean|Plaid pending flag|

**GSI:** `accountId-date-index` on `accountId` + `date` for per-account transaction views.

**Retention:** Keep all. Pull from Plaid with 30-day lookback on initial sync; use cursor-based sync (`/transactions/sync`) after that.

---

### Table: `category_rules`

User-defined categorization rules.

|Attribute|Type|Notes|
|---|---|---|
|`PK`|String|`householdId`|
|`SK`|String|`ruleId` (UUID)|
|`priority`|Number|Lower = evaluated first. Unique per household.|
|`matchOn`|String|`merchantName`, `description`, `amount`|
|`matchType`|String|`contains`, `equals`, `startsWith`, `endsWith`, `regex`|
|`matchValue`|String|The string to match against|
|`amountMin`|Number|If `matchOn` is `amount`: min threshold|
|`amountMax`|Number|If `matchOn` is `amount`: max threshold|
|`assignCategory`|String|Category to assign on match|
|`assignSubcategory`|String|Optional subcategory|
|`isActive`|Boolean||

**Category enum (system-defined):**

```
Income | Housing | Groceries | Gas | Dining | Phone |
Utilities | Internet | Childcare | Childcare_Storage |
Debt_Payment | Shopping | Entertainment | Medical |
Subscriptions | Other
```

**Processing logic (Lambda, runs on each transaction during sync):**

1. Load all active rules for `householdId` ordered by `priority` ascending
2. For each transaction, evaluate rules in order — first match wins
3. If no rule matches: map Plaid category to system category using static mapping table
4. Store `resolvedCategory`, `matchedRuleId`
5. Transactions already marked `isManuallyRecategorized = true` are skipped (user override is final)

**Plaid → System category fallback map (static, in Lambda):**

```javascript
const PLAID_CATEGORY_MAP = {
  "Food and Drink": "Groceries",
  "Shops": "Shopping",
  "Travel": "Gas",
  "Automotive": "Gas",
  "Payment": "Debt_Payment",
  "Transfer": null,           // exclude from spending view
  "Payroll": "Income",
  "Recreation": "Entertainment",
  "Healthcare": "Medical",
  "Service": "Other",
  // ... extend as needed
};
```

---

### Table: `spending_plans`

Versioned by pay date.

|Attribute|Type|Notes|
|---|---|---|
|`PK`|String|`householdId`|
|`SK`|String|`payDate` (ISO: `"2026-09-15"`)|
|`label`|String|Auto: `"Sep 15 Plan"`|
|`income`|Number|Expected total net income this period|
|`allocations`|Map|`{ category: amount }` — matches category enum above|
|`notes`|String|Free text|
|`score`|String|A/B/C/D/F (calculated on save)|
|`scoreBreakdown`|Map|Components used to calculate score|
|`createdAt`|String|ISO timestamp|
|`updatedAt`|String|ISO timestamp|

**Scoring logic (calculated server-side on save):**

```
debtContributionPct = (allocations.Debt_Payment + G1_extra) / income * 100
savingsContributionPct = G2_allocation / income * 100
combinedPct = debtContributionPct + savingsContributionPct

A: combinedPct >= 25%
B: combinedPct >= 20%
C: combinedPct >= 15%
D: combinedPct >= 10%
F: combinedPct < 10%
```

---

### Table: `pcs_simulations`

Saved PCS Profit Simulator runs.

|Attribute|Type|Notes|
|---|---|---|
|`PK`|String|`householdId`|
|`SK`|String|`simulationId` (timestamp-UUID)|
|`label`|String|User-defined name for this run|
|`truckType`|String|`10ft`, `15ft`, `20ft`, `26ft`|
|`truckDailyRate`|Number|User inputs U-Haul quoted rate|
|`truckMileageRate`|Number|U-Haul per-mile rate|
|`towEquipment`|String|`tow_dolly`, `auto_transport`, `toy_hauler`|
|`towCost`|Number|User inputs quoted tow equipment cost|
|`routeMiles`|Number|Default 2800 (29 Palms → Camp Lejeune); user-editable|
|`tripDays`|Number||
|`travelers`|Number||
|`hotelStops`|List|`[{ city, state, nights, costPerNight }]`|
|`materialWeightLbs`|Number|Weight of added materials|
|`materialCost`|Number|Cost to purchase materials|
|`estimatedHHGWeight`|Number|Household goods estimated weight (lbs)|
|`gasPriceTier`|String|`low`, `mid`, `high`|
|`gasPricePerGallon`|Number|Auto-populated from tier or overridden|
|`truckMPG`|Number|Default per truck type; user-editable|
|`povMPG`|Number|Personal vehicle MPG (pickup truck towing)|
|`numVehicles`|Number|Default 2 (truck + POV)|
|`dlaAmount`|Number|DLA entitlement (default $2,366 for O1 w/dep; user-editable)|
|`govPPMRatePerLbPerMile`|Number|Current JTR rate; user-editable (default: see constants)|
|`results`|Map|Calculated outputs (see below)|
|`createdAt`|String|ISO timestamp|

**Calculated results (server-side on save):**

```javascript
const results = {
  totalWeight: estimatedHHGWeight + materialWeightLbs,
  truckRentalCost: truckDailyRate * tripDays + truckMileageRate * routeMiles,
  towCost: towCost,
  fuelCost_truck: (routeMiles / truckMPG) * gasPricePerGallon,
  fuelCost_pov: (routeMiles / povMPG) * gasPricePerGallon,
  hotelCost: hotelStops.reduce((sum, s) => sum + s.nights * s.costPerNight, 0),
  foodCost: calculateMIE(tripDays, travelers),  // GSA per diem function
  materialCost: materialCost,
  totalExpenses: /* sum all cost lines above */,
  govConstructiveCost: totalWeight * govPPMRatePerLbPerMile * routeMiles,
  grossPPMProfit: govConstructiveCost - totalExpenses,
  taxReserve22Pct: grossPPMProfit * 0.22,
  netPPMProfit: grossPPMProfit * 0.78,
  dlaAmount: dlaAmount,
  totalNetToHousehold: netPPMProfit + dlaAmount,
};
```

**M&IE calculation (use GSA API or static CONUS rate):**

- CONUS standard M&IE: $68/day (2026)
- Day 1 and last day: 75% of daily rate
- Additional travelers: 75% of primary traveler rate
- Function: `calculateMIE(tripDays, travelers)` in `shared/utils/mie.js`
- Pull live from: `https://api.gsa.gov/travel/perdiem/v2/rates/conus/year/2026` (no key required)

**Gas price tier defaults (update via EIA API or hard-code):**

```javascript
const GAS_TIERS = { low: 3.00, mid: 3.50, high: 4.00 }; // per gallon
```

**EIA API for live gas prices (optional, use if EIA call succeeds):**

```
GET https://api.eia.gov/v2/petroleum/pri/gnd/data/?api_key=DEMO&frequency=weekly&data[0]=value&facets[product][]=EPM0&facets[duoarea][]=R50
```

R50 = Western U.S. (relevant for origin). Pull on PCS simulator load; fallback to static tiers if API fails.

**Default truck MPG:**

```javascript
const TRUCK_MPG = { "10ft": 12, "15ft": 10, "20ft": 10, "26ft": 8 };
```

---

### Table: `tasks`

Shared PCS checklist. Both users can read/write.

|Attribute|Type|Notes|
|---|---|---|
|`PK`|String|`householdId`|
|`SK`|String|`taskId` (UUID)|
|`title`|String||
|`category`|String|`Admin`, `Housing`, `Finance`, `Logistics`, `Vehicles`|
|`daysBeforePCS`|Number|Recommended days before PCS to complete (negative = days after)|
|`isComplete`|Boolean||
|`completedBy`|String|`userId` of who checked it off|
|`completedAt`|String|ISO timestamp|
|`notes`|String||
|`isUserAdded`|Boolean|True if user added it (vs. pre-seeded)|

**Pre-seed data:** On first household creation, seed ~30 standard USMC PCS tasks into the table. Define in `backend/seed/tasks.json`.

---

### Table: `cashflow_events`

All events (income, bills, payments) that populate the calendar.

|Attribute|Type|Notes|
|---|---|---|
|`PK`|String|`householdId`|
|`SK`|String|`eventDate#eventId` (e.g. `"2026-09-15#evt_001"`)|
|`eventDate`|String|ISO date|
|`eventId`|String|UUID|
|`type`|String|`income`, `bill`, `credit_payment`, `loan_payment`, `other`|
|`description`|String||
|`amount`|Number|Positive = inflow, negative = outflow|
|`accountId`|String|FK to accounts (optional)|
|`source`|String|`plaid`, `recurring`, `manual`|
|`plaidTransactionId`|String|If matched from Plaid (deduplication)|
|`isRecurring`|Boolean||
|`recurringDayOfMonth`|Number|For bills (e.g. due on 15th)|
|`isPCSRelated`|Boolean|Flag PCS reimbursements and related events|

**GSI:** `householdId-eventDate-index` on `householdId` + `eventDate` for monthly range queries.

---

### Table: `g2_tracker`

Simple G2 fund tracking.

|Attribute|Type|Notes|
|---|---|---|
|`PK`|String|`householdId`|
|`SK`|String|`"current"` (single record, updated in place)|
|`targetAmount`|Number|User-defined G2 goal|
|`currentAmount`|Number|Current balance (tied to Joint Savings account)|
|`savingsAccountId`|String|FK to accounts table (Joint Savings)|
|`monthlyContribution`|Number|How much user plans to add per month|
|`projectedReachDate`|String|Calculated: currentAmount + (monthlyContribution × months) >= target|
|`pcsDate`|String|ISO date (target deadline)|
|`notes`|String||
|`updatedAt`|String|ISO timestamp|

**Projection logic:**

```javascript
const monthsToGoal = Math.ceil((targetAmount - currentAmount) / monthlyContribution);
const projectedReachDate = addMonths(today, monthsToGoal).toISOString();
const willReachByPCS = projectedReachDate <= pcsDate;
```

---

### Table: `g3_tracker`

Credit score history and utilization snapshots.

|Attribute|Type|Notes|
|---|---|---|
|`PK`|String|`householdId`|
|`SK`|String|`recordDate#userId` (e.g. `"2026-09-05#cj"`)|
|`userId`|String|`cj` or `victoria`|
|`recordDate`|String|ISO date of manual entry|
|`equifaxScore`|Number|FICO 8 Equifax|
|`transunionScore`|Number|FICO 8 TransUnion (null for CJ if not pulled)|
|`experianScore`|Number|FICO 8 Experian (null for CJ if not pulled)|
|`equifaxUtil`|Number|Calculated from Plaid balance snapshots at this date|
|`transunionUtil`|Number|Manual or null|
|`experianUtil`|Number|Manual or null|
|`notes`|String||

**Utilization calculation from Plaid (server-side, runs on snapshot save):**

```javascript
// For all revolving accounts in household where isG1Target = true
const revolving = accounts.filter(a => a.creditLimit > 0);
const totalBalance = revolving.reduce((sum, a) => sum + a.currentBalance, 0);
const totalLimit = revolving.reduce((sum, a) => sum + a.creditLimit, 0);
const aggregateUtil = (totalBalance / totalLimit) * 100;
```

---

## Lambda Functions

### `plaid-sync` (EventBridge daily + on-demand)

**Trigger:** EventBridge Scheduler, daily at 06:00 UTC (11 PM Pacific / 2 AM Eastern — off-peak)

**Logic:**

1. Query `plaid_items` for all active items in household
2. For each item, call `plaidClient.transactionsSync()` using stored cursor (from last run)
3. Store cursor for next run
4. For each new/modified transaction: a. Upsert into `transactions` table b. Run categorization rules engine
5. For each account in item, call `plaidClient.accountsGet()`
6. Upsert account balances into `accounts` table
7. Write daily snapshot to `balance_snapshots`
8. Run upcoming payment prediction (see below)
9. Update cashflow calendar events where source = `plaid`

**Upcoming payment prediction logic (runs after each sync):**

```javascript
// For each revolving account where statementCloseDay is set:
const today = new Date();
const lastCloseDate = getLastCloseDate(account.statementCloseDay);
const nextCloseDate = getNextCloseDate(account.statementCloseDay);

// Get transactions since last statement close
const txSinceClose = transactions.filter(t => 
  t.accountId === account.accountId && 
  t.date >= lastCloseDate &&
  !t.isTransfer
);

// Sum new charges since last close
const newCharges = txSinceClose.reduce((sum, t) => sum + t.amount, 0);

// Projected balance at next close
const projectedStatementBalance = account.currentBalance; // Plaid gives live balance
  
// Project minimum payment (2% of balance or $25, whichever is greater)
const projectedMinimum = Math.max(projectedStatementBalance * 0.02, 25);

// Due date: statement close day + 21 days (standard grace period)
const dueDate = addDays(nextCloseDate, 21);

// Write to cashflow_events if not already present
upsertCashflowEvent({
  householdId,
  eventDate: dueDate,
  type: 'credit_payment',
  description: `${account.name} payment due`,
  amount: -projectedMinimum,
  accountId: account.accountId,
  source: 'plaid',
});
```

---

### `plaid-link-create`

**POST `/plaid/link-token`**

Request: none (householdId from JWT)

Response:

```json
{ "linkToken": "link-sandbox-xxx" }
```

Lambda calls `plaidClient.linkTokenCreate()` with:

- `user.client_user_id`: householdId
- `products`: `["transactions"]`
- `country_codes`: `["US"]`

---

### `plaid-exchange-token`

**POST `/plaid/exchange-token`**

Request:

```json
{ "publicToken": "public-sandbox-xxx", "institutionId": "ins_3", "institutionName": "Navy Federal Credit Union" }
```

Lambda:

1. Exchange public token for access token
2. Store in `plaid_items` (never return access token to frontend)
3. Immediately call sync to pull initial accounts + 30 days transactions

---

### `accounts` (GET)

**GET `/accounts`**

Returns all accounts for household. **Never returns `accessToken` or `plaidItemId`.**

Response:

```json
{
  "accounts": [
    {
      "accountId": "plaid_acct_xxx",
      "name": "cashRewards Plus",
      "type": "credit",
      "currentBalance": 10394.96,
      "creditLimit": 11000,
      "utilization": 94.5,
      "apr": 18,
      "statementCloseDay": 10,
      "dueDay": null,
      "isG1Target": true,
      "g1Order": 5,
      "lastSynced": "2026-09-05T06:00:00Z"
    }
  ]
}
```

---

### `transactions`

**GET `/transactions`**

Query params:

- `startDate` (ISO)
- `endDate` (ISO)
- `accountId` (optional, filter)
- `category` (optional, filter)
- `excludeTransfers` (boolean, default true)

Returns transactions with resolved categories applied.

**POST `/transactions/{transactionId}/categorize`**

Body: `{ "category": "Groceries", "subcategory": "Costco" }`

Sets `resolvedCategory`, `isManuallyRecategorized = true`, clears `matchedRuleId`.

---

### `category-rules`

**GET `/category-rules`** — returns all rules ordered by priority

**POST `/category-rules`** — create rule, auto-assigns next priority

**PUT `/category-rules/{ruleId}`** — update rule (including priority reorder)

**DELETE `/category-rules/{ruleId}`** — delete rule

**POST `/category-rules/test`** — test a rule against recent transactions without saving Body: `{ "matchOn": "merchantName", "matchType": "contains", "matchValue": "T-MOBILE" }` Returns: list of transactions that would match

---

### `spending-plans`

**GET `/spending-plans`** — list all plans, sorted by payDate desc

**GET `/spending-plans/{payDate}`** — get single plan with actual spending pulled from transactions for that date range

When fetching a single plan, Lambda:

1. Gets plan from DynamoDB
2. Pulls transactions for `payDate` through `payDate + 14 days` (one pay period)
3. Groups by resolvedCategory and sums
4. Returns plan allocations + actuals side-by-side

**POST `/spending-plans`** — create plan, calculate score on save

**PUT `/spending-plans/{payDate}`** — update plan, recalculate score

---

### `cashflow`

**GET `/cashflow/{year}/{month}`**

Returns all cashflow events for the given month, sorted by `eventDate`. Includes:

- Recurring pay deposits (1st and 15th, CJ + Victoria)
- All bill events from recurring schedule
- Plaid-matched actual payments
- Manual events
- Predicted upcoming payments

Response also includes:

```json
{
  "events": [...],
  "dailyRunningBalance": {
    "2026-09-01": 5207.32,
    "2026-09-02": 5207.32,
    ...
  },
  "lowestPointDate": "2026-09-24",
  "lowestPointBalance": 1842.11,
  "negativeDays": []
}
```

Running balance starts from current Joint Checking balance (manual input — checking balance is not tracked by Plaid in app scope per account status notes).

**POST `/cashflow/events`** — add manual event

**DELETE `/cashflow/events/{eventId}`** — delete manual event (only source = `manual`)

---

### `g1-tracker`

**GET `/g1`**

Returns full G1 state:

1. All G1 accounts ordered by `g1Order`
2. Current balances from `accounts` table (Plaid live)
3. Snowball projection given `monthlyExtraPayment` input

**Snowball projection logic:**

```javascript
function calculateSnowball(accounts, monthlyExtra) {
  // accounts: sorted by balance ascending (snowball order)
  // monthlyExtra: total extra payment beyond all minimums
  
  let schedule = [];
  let remainingExtra = monthlyExtra;
  let month = 0;
  const accounts = deepClone(accounts); // mutate copies
  
  while (accounts.some(a => a.balance > 0)) {
    month++;
    for (let i = 0; i < accounts.length; i++) {
      if (accounts[i].balance <= 0) continue;
      
      const payment = i === firstUnpaid(accounts) 
        ? accounts[i].minimumPayment + remainingExtra
        : accounts[i].minimumPayment;
      
      const interest = (accounts[i].balance * (accounts[i].apr / 100)) / 12;
      accounts[i].balance = Math.max(0, accounts[i].balance + interest - payment);
      
      if (accounts[i].balance === 0) {
        // Roll minimum into next account's extra
        remainingExtra += accounts[i].minimumPayment;
        schedule.push({ accountId: accounts[i].accountId, paidOffMonth: month });
      }
    }
    
    if (month > 360) break; // safety cap
  }
  
  return { schedule, totalMonths: month, projectedPayoffDate: addMonths(today, month) };
}
```

**PUT `/g1/order`** — reorder G1 accounts (snowball queue) Body: `[{ accountId, g1Order }]`

---

### `g2-tracker`

**GET `/g2`** — returns current G2 state + projection

**PUT `/g2`** — update target, contribution, pcsDate

G2 current balance is read from the linked savings account in `accounts` table (Plaid live balance for Joint Savings Navy Fed). If savings account is connected to Plaid, it updates automatically on daily sync.

---

### `g3-tracker`

**GET `/g3`** — returns all score records for both users, sorted by date

**POST `/g3`** — add new score entry (manual monthly input) Body:

```json
{
  "userId": "cj",
  "recordDate": "2026-09-05",
  "equifaxScore": 562,
  "transunionScore": null,
  "experianScore": null,
  "notes": "Pulled from myFICO"
}
```

On POST, Lambda automatically appends current Plaid-derived utilization to the record.

---

### `pcs-simulator`

**GET `/pcs-simulator`** — list all simulation runs, sorted by createdAt desc

**GET `/pcs-simulator/{simulationId}`** — get single run

**POST `/pcs-simulator`** — create and calculate simulation. Calculations run server-side. Returns full results object.

**DELETE `/pcs-simulator/{simulationId}`** — delete a run

---

### `tasks`

**GET `/tasks`** — returns all tasks grouped by category, sorted by daysBeforePCS

**POST `/tasks`** — add task

**PUT `/tasks/{taskId}`** — update task (including isComplete toggle — stores completedBy from JWT)

**DELETE `/tasks/{taskId}`** — delete user-added task only (`isUserAdded = true`)

---

### `rentals-proxy`

**GET `/rentals`**

Query params (forwarded to RentCast):

- `bedrooms`
- `bathrooms`
- `maxRent`
- `zipCodes` (hardcoded in Lambda: `28540,28541,28546,28547`)

Lambda caches last response in DynamoDB (`PK: "rentals_cache"`, TTL: 24h). Returns cached if fresh, calls RentCast if stale.

RentCast endpoint:

```
GET https://api.rentcast.io/v1/listings/rental/long-term
  ?zipCode=28546
  &bedrooms={bedrooms}
  &status=Active
```

RentCast API key stored in **AWS SSM Parameter Store** (SecureString). Lambda reads at cold start.

---

### `reminders`

**EventBridge scheduled rule:** Runs daily at 12:00 UTC

Lambda logic:

```javascript
const today = new Date();

// Check each cashflow event in next 3 days
const upcomingEvents = await getCashflowEvents(today, addDays(today, 3));

for (const event of upcomingEvents) {
  const daysUntil = differenceInDays(new Date(event.eventDate), today);
  
  if (daysUntil === 3 || daysUntil === 1) {
    await sns.publish({
      Message: `Upcoming: ${event.description} — $${Math.abs(event.amount)} due in ${daysUntil} day(s)`,
      TopicArn: process.env.REMINDERS_TOPIC_ARN,
    });
  }
}

// Check statement close dates
const closingCards = accounts.filter(a => 
  a.statementCloseDay === today.getDate() + 1 ||
  a.statementCloseDay === today.getDate() + 3
);

for (const card of closingCards) {
  await sns.publish({
    Message: `${card.name} statement closes in ${daysUntil} day(s). Check utilization before it posts.`,
    TopicArn: process.env.REMINDERS_TOPIC_ARN,
  });
}
```

SNS Topic: `household-reminders`. CJ and Victoria phone numbers as subscriptions (SMS).

---

## API Gateway Routes Summary

```
POST   /plaid/link-token
POST   /plaid/exchange-token

GET    /accounts
GET    /accounts/{accountId}/history      # balance snapshots

GET    /transactions
POST   /transactions/{id}/categorize

GET    /category-rules
POST   /category-rules
PUT    /category-rules/{ruleId}
DELETE /category-rules/{ruleId}
POST   /category-rules/test

GET    /spending-plans
GET    /spending-plans/{payDate}
POST   /spending-plans
PUT    /spending-plans/{payDate}

GET    /cashflow/{year}/{month}
POST   /cashflow/events
DELETE /cashflow/events/{eventId}

GET    /g1
PUT    /g1/order

GET    /g2
PUT    /g2

GET    /g3
POST   /g3

GET    /pcs-simulator
GET    /pcs-simulator/{simulationId}
POST   /pcs-simulator
DELETE /pcs-simulator/{simulationId}

GET    /tasks
POST   /tasks
PUT    /tasks/{taskId}
DELETE /tasks/{taskId}

GET    /rentals
```

All routes: `Authorization: Bearer {CognitoJWT}` required. `householdId` always read from JWT, never from request.

---

## Frontend Pages & Key Logic

### `/` — Dashboard

- Summary cards: G1 remaining balance, G2 progress vs target, CJ utilization %, Victoria best FICO score
- Snapshot of cashflow for current pay period
- Alert banner if any account `needs_reauth` (Plaid token expired)
- Alert if any cashflow day goes negative in the current month

### `/cashflow` — Cashflow Calendar

- Monthly calendar view
- Each day shows events with amounts
- Running balance line: starts from manual starting balance (user inputs once, stored in G2 tracker or separate config)
- Color-code events by type (income vs. outflow — logic only, no CSS spec)
- Highlight PCS window (Dec 15 – Jan 31) as a range
- Button: "+ Add Manual Event"

### `/transactions` — Transactions

- Filterable table: date range, account, category
- Each row: date, merchant, amount, category badge, edit category button
- Bulk actions: select multiple → assign category
- Tab or link to "Categorization Rules" sub-page

### `/transactions/rules` — Categorization Rules

- List of rules ordered by priority
- Drag-to-reorder priority
- Form to add/edit rule: matchOn, matchType, matchValue, assignCategory
- "Test Rule" button: shows matching transactions from last 30 days before saving

### `/g1` — Debt Snowball Tracker

- List of G1 accounts in snowball order (drag-to-reorder)
- Per account: balance, limit, utilization gauge, APR, projected payoff date
- Input: "Monthly extra payment: $___"
- Output: payoff date per account, total months to G1 completion, total interest cost
- Toggle: Snowball / Avalanche (recalculates order and projection)
- Running total: how much has been paid off since tracking started (compare first snapshot to current)

### `/g2` — PCS Fund Tracker

- Current balance (Plaid live from Joint Savings)
- Target amount (editable)
- Monthly contribution (editable)
- PCS date (editable)
- Progress bar: current / target
- Projection: will you hit target by PCS date? (yes/no + projected date)

### `/g3` — Credit & Utilization

- Two sections: CJ and Victoria
- Per user: FICO 8 scores by bureau, history chart (line chart over time as manual entries accumulate)
- Per user: revolving utilization (CJ = Plaid-calculated, Victoria = Plaid-calculated for her accounts)
- Per card: individual utilization gauge
- "Log Score" button: modal to enter latest FICO scores manually
- Target tracker: shows how many points to reach next tier (600, 620, 640, 660, 680, 700)
- Utilization target: shows current %, shows balance needed to reach 30% and 20%

### `/spending-plans` — Spending Plans

- List of saved plans by pay date (newest first)
- Button: "+ New Plan (Sep 15)"
- Each plan shows: score grade, income, allocated vs. actual per category
- Actuals pulled from Plaid transactions for that pay period
- Score breakdown shown

### `/pcs-simulator` — PCS Profit Simulator

- Form: all inputs per spec above
- "Calculate" button → POST to Lambda → returns results
- Results displayed inline
- "Save This Run" button → stores with user-defined label
- Saved runs list with ability to reload and compare

### `/tasks` — PCS Checklist

- Grouped by category
- Sorted by daysBeforePCS (most urgent first, based on configured PCS date)
- Checkbox to complete — shows who completed it and when
- "+ Add Task" button
- PCS date configurable at top

### `/rentals` — Rental Listings

- Filters: bedrooms, bathrooms, max monthly rent
- "Search" button → GET /rentals → displays results
- "Last refreshed: X" timestamp shown
- Each listing: address, rent, beds/baths, sqft, days on market, listing link

### `/settings` — Settings

- Connected accounts (Plaid items): list, status, "Connect New" button, "Disconnect" button
- Manual accounts: add/edit/remove non-Plaid accounts
- Account configuration: set APR, statement close day, due day, G1 target flag, G1 order
- Notification preferences: phone numbers for SNS, which alerts to receive
- PCS date (global, used by tasks + cashflow + G2 tracker)
- Export data button (see below)

---

## Data Export (Clipboard)

**Location:** Settings page, "Export for Claude" button.

**Function (client-side, no API call):**

```javascript
function buildExportPrompt(dashboardData) {
  return `
---HOUSEHOLD FINANCIAL SNAPSHOT (${new Date().toLocaleDateString()})---

GOAL 1 — REVOLVING DEBT (Snowball)
Total Remaining: $${g1.totalBalance}
Queue: ${g1.accounts.map(a => `${a.name} $${a.balance} @ ${a.apr}%`).join(' → ')}
At $${g1.monthlyExtra}/mo extra: payoff in ${g1.projection.totalMonths} months (${g1.projection.projectedPayoffDate})

GOAL 2 — PCS FUND
Target: $${g2.targetAmount} by ${g2.pcsDate}
Current: $${g2.currentAmount}
Monthly contribution: $${g2.monthlyContribution}
On track: ${g2.onTrack ? 'YES' : 'NO'} (projected: ${g2.projectedReachDate})

GOAL 3 — CREDIT
CJ FICO 8 (Equifax): ${g3.cj.equifaxScore} | Utilization: ${g3.cj.utilization}%
Victoria FICO 8 (Equifax): ${g3.victoria.equifaxScore} | Utilization: ${g3.victoria.utilization}%

CURRENT SPENDING PLAN (${spendingPlan.payDate})
Income: $${spendingPlan.income}
${Object.entries(spendingPlan.allocations).map(([k, v]) => `${k}: $${v}`).join('\n')}
Score: ${spendingPlan.score}

RECENT TRANSACTIONS (last 14 days by category)
${categoryTotals.map(c => `${c.category}: $${c.total}`).join('\n')}

---YOUR QUESTION---
[Type your question here]
`.trim();
}

// Button handler
navigator.clipboard.writeText(buildExportPrompt(dashboardData));
```

---

## Environment Variables

**Lambda (all functions):**

```
DYNAMODB_REGION=us-east-1
ACCOUNTS_TABLE=accounts
PLAID_ITEMS_TABLE=plaid_items
BALANCE_SNAPSHOTS_TABLE=balance_snapshots
TRANSACTIONS_TABLE=transactions
CATEGORY_RULES_TABLE=category_rules
SPENDING_PLANS_TABLE=spending_plans
PCS_SIMULATIONS_TABLE=pcs_simulations
TASKS_TABLE=tasks
CASHFLOW_EVENTS_TABLE=cashflow_events
G2_TABLE=g2_tracker
G3_TABLE=g3_tracker
REMINDERS_TOPIC_ARN=arn:aws:sns:us-east-1:xxx:household-reminders
```

**SSM Parameter Store (SecureString — Lambda reads at runtime, NOT env vars):**

```
/household/plaid/client-id
/household/plaid/secret
/household/plaid/env          # sandbox | development | production
/household/rentcast/api-key
```

**Frontend (Vite .env):**

```
VITE_API_URL=https://xxx.execute-api.us-east-1.amazonaws.com
VITE_COGNITO_USER_POOL_ID=us-east-1_xxx
VITE_COGNITO_CLIENT_ID=xxx
VITE_AWS_REGION=us-east-1
```

---

## EventBridge Rules

|Rule Name|Schedule|Target Lambda|Purpose|
|---|---|---|---|
|`daily-plaid-sync`|`cron(0 6 * * ? *)`|`plaid-sync`|Balance + transaction pull|
|`daily-reminders`|`cron(0 12 * * ? *)`|`reminders`|Bill due alerts|

---

## Cost Estimate (Monthly)

|Service|Usage|Cost|
|---|---|---|
|AWS Lambda|~500 invocations/month|Free tier|
|API Gateway|~1,000 calls/month|Free tier|
|DynamoDB|<1 GB, low throughput|Free tier|
|S3 + CloudFront|Static SPA hosting|Free tier|
|Cognito|2 users|Free tier|
|EventBridge|2 rules, 60 invocations/month|~$0.00|
|SNS|<100 SMS/month|~$0.08|
|SSM Parameter Store|4 SecureString params|$0.80|
|Plaid Core (10 connections)|~10 accounts|~$3–5|
|RentCast|<50 requests/month|$0 (free tier)|
|**Total**||**~$4–6/month**|

---

## Build Order (Recommended)

1. AWS infrastructure (Cognito, DynamoDB tables, API Gateway skeleton, S3 + CloudFront)
2. Auth flow (Cognito signup/login for CJ + Victoria, JWT verification in Lambda)
3. Plaid link + exchange token + initial sync (foundation everything else builds on)
4. Accounts page + balance snapshot storage
5. Transactions + categorization rules engine
6. G1 snowball tracker (uses live Plaid balances)
7. Cashflow calendar (Plaid auto-population + recurring bills)
8. Spending plans (depends on transactions)
9. G2 tracker (simple, links to Joint Savings balance)
10. G3 tracker (manual score input + Plaid utilization)
11. PCS Profit Simulator
12. Tasks checklist
13. Rentals proxy
14. Reminders (SNS)
15. Data export button
16. Settings page (Plaid management, account config)

---

_Build spec v2.0 — 09/05/2026 — Claude Code ready_ _No design elements. All business logic and data schemas specified._