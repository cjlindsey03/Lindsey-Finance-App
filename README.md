# Lindsey Household Finance App

Two-user household financial dashboard, deployed at `https://d1r46125sashz0.cloudfront.net`.

The original spec is [`Build Instructions.md`](Build%20Instructions.md), but it predates two
significant changes — Plaid was removed entirely, and the Spending Plan became the app's
engine. This README describes what the app actually does now.

## How the app works

**There is no bank integration.** Plaid was removed: on the sandbox tier it could only ever
reach Plaid's fake test institutions, never real Navy Federal or Capital One data, and paid
Plaid tiers were out of scope. Everything is maintained deliberately instead:

- **Recurring Bills** — every paycheck and regular bill (amount, category, day of month).
  This is the single source of truth for the cashflow projection and for pre-filling plans.
- **Spending Plans** — the engine. Draft several plans for a pay period, see each scored
  A–F on how much of your income goes to debt and savings, then **commit** one. Committing
  is what moves money: the per-account payments you enter are subtracted from those
  balances, which is what updates G1, G3, and the dashboard.
- **Accounts** — hand-maintained in Settings; balances also move on plan commit, and every
  change writes a balance snapshot so G3 builds a real utilization history.
- **Cashflow** — a net-flow analyzer, deliberately *not* a bank balance. It starts at $0 and
  answers "does this month's income cover its bills, and where is it tightest?"
- **Reports** — a one-page PDF per pay period (income vs. bills line by line, the committed
  plan's grade, a goals snapshot). Generated automatically at the end of each period, and on
  demand for any period from the Reports page.

**Pay periods are calendar half-months** (1st–14th, 15th–EOM), matching the 1st/15th
paydays. Drafts belong to a period; once it rolls over, stale drafts are purged by the daily
scheduled job and only committed plans are kept as history.

## Repo layout

```
backend/    AWS SAM app — 11 Lambdas, 9 DynamoDB tables, Cognito, S3 + CloudFront
frontend/   Vite + React SPA (installable PWA)
```

> **This repo must live on a local disk.** npm cannot install into Google Drive's virtual
> filesystem (`G:`) — it fails with `EBADF`. The working copy is `C:\dev\Lindsey-Finance-App`.

## One-time setup

Node 20+, Docker Desktop, AWS SAM CLI, and esbuild on PATH (`npm install -g esbuild` — the
bundle step shells out to it).

## Local development

```bash
cd backend
docker compose up -d
bash scripts/create-local-tables.sh      # idempotent
cp env.local.json.example env.local.json # add your RentCast key
npm install && npm run seed              # accounts, bills, starter plan
npm run build                            # = npm run bundle && sam build

# SAM resolves real AWS credentials at startup even for local runs, so pin dummies:
AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local AWS_DEFAULT_REGION=us-east-1 \
  sam local start-api --env-vars env.local.json --docker-network sam-local
```

```bash
cd frontend
npm install
cp .env.example .env    # VITE_API_URL=/api and VITE_AUTH_MODE=local
npm run dev
```

`VITE_AUTH_MODE=local` skips Cognito (which can't run offline) and `VITE_API_URL=/api` routes
through Vite's proxy so calls are same-origin. The backend mirrors this: `shared/auth.js`
assumes the one household when `AWS_SAM_LOCAL` is set.

`npm run seed` is also the cleanup path — it removes rows left by earlier versions of the
app and re-seeds the household's real accounts and bills.

## Deploying

```bash
cd backend && npm run build
sam deploy --stack-name lindsey-finance-app --region us-west-1 --resolve-s3 \
  --capabilities CAPABILITY_IAM --parameter-overrides \
    RentcastApiKey=... AllowedOrigin=https://d1r46125sashz0.cloudfront.net \
    CjPhoneNumber=+1... VictoriaPhoneNumber=+1...
```

```bash
cd frontend && npm run build   # uses .env.production
aws s3 sync dist/ s3://lindsey-finance-app-frontendbucket-nrdiyaxwgkqx/ --region us-west-1 --delete
aws cloudfront create-invalidation --distribution-id E15OUMHEJ3XUUZ --paths "/*"
```

`.env.production` holds the API URL and Cognito IDs, and must set `VITE_AUTH_MODE=` explicitly
— Vite *merges* env files rather than replacing them, so without that the local auth bypass
from `.env` leaks into the production build.

Deployed resources: API `https://w7spvuctfl.execute-api.us-west-1.amazonaws.com`, Cognito pool
`us-west-1_UdSJ4qPjT` / client `uh2gguuesajed3hjsi4ut6hh6`. AWS CLI is currently authenticated
as the account **root** user — worth replacing with a scoped IAM user.

## Status

Verified end to end against the live deployment and locally:

- Draft → score → commit moves the named balances by exactly the entered amounts, writes
  snapshots, updates G1/G3, and refuses a second commit for the same period
- Cashflow reports income/bills/net with no account balance involved
- Stale drafts are purged on the daily job; committed plans survive
- Rentals returns real listings, all 4+ bedrooms and ≤ $2,300, within 50 miles of Camp
  Lejeune, in a single API call
- The PCS simulator reproduces the settled Quantico → Twentynine Palms vouchers to within
  $0.64 on the $6,068.51 PPM, and returns DLA at exactly $3,085.23
- Gas prices come back live from EIA (national average and PADD spread), cached 24h
- All 12 pages render error-free at 344 / 390 / 884 / 1440 px

## PCS simulator accuracy

`shared/pcsRates.js` holds every entitlement constant in one place, each annotated with its
source and — where one exists — the settled voucher that confirms it. DLA, the $178/day
member per-diem rate, the 75% / 50% dependent tiers, and the 12,000 lb O-1 weight allowance
are all confirmed against real payments rather than taken from a published table.

The one figure that is genuinely an **estimate** is the Government Constructed Cost, which
sets the PPM payment. There is no public API for it — TMO computes it from DoD contract rate
tables by lane, weight and season. A flat per-pound-per-mile factor does not work: a 2,440 lb
move priced at $0.000987/lb-mile while a 9,000 lb one priced at $0.00042. Fitting both points
to `GCC = miles × (1.894 + 0.000211 × weight)` reproduces each within a dollar, and that is
what the simulator uses.

Treat it as ±25%, and enter the real number in **Actual GCC from TMO** as soon as you have
it — the UI labels the line "(estimate)" until you do. The fit rests on two CONUS long-haul
data points, so it will be least trustworthy for short moves or unusual lanes.

## Rentals photos and links

RentCast returns no photos and no listing URLs — verified against all 84 cached listings. It
does return exact coordinates, so each listing gets a Google Street View image of the address
and a labelled address search. **Neither is a listing photo or a listing link**, and the page
says so directly rather than implying otherwise.

## Notifications are built but dormant

The reminders Lambda publishes bill-due and statement-close warnings, plus a period-end
report notice, to the `household-reminders` SNS topic, and both phone numbers are
subscribed. **None of it delivers yet.** The account is in the SNS SMS sandbox, and getting
out requires A2P 10DLC originator registration (AWS gates this behind business
registration). That registration has been requested; once it's approved the texts start
arriving on their own with no code change.

Until then the app is meant to be used by pulling up reports directly — generate one from
the Reports page whenever you want it.

Note that a successful `sns:Publish` proves nothing about delivery: in sandbox, messages to
unverified numbers are accepted and silently dropped.
