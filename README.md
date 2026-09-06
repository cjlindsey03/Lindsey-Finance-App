# Lindsey Household Finance App

Two-user household financial dashboard. Full spec: [`Build Instructions.md`](Build%20Instructions.md). Build plan and current status tracked in this README; architecture decisions live in the spec.

## Repo layout

```
backend/    AWS SAM app — Lambda functions, DynamoDB tables, Cognito
frontend/   Vite + React SPA
```

## Local development (Plaid sandbox, no real AWS needed)

1. **DynamoDB Local:**
   ```
   cd backend
   docker-compose up -d
   bash scripts/create-local-tables.sh
   ```
2. **Backend secrets:** copy `backend/env.local.json.example` → `backend/env.local.json`, fill in your Plaid **sandbox** client ID/secret (from the Plaid dashboard).
3. **Run the API locally:**
   ```
   cd backend
   npm install
   sam build
   npm run local-api
   ```
   This starts API Gateway + Lambda locally on `http://localhost:3000`, using DynamoDB Local and a mocked household (`AWS_SAM_LOCAL=true` skips real Cognito auth — see `backend/shared/auth.js`).
4. **Run the frontend:**
   ```
   cd frontend
   npm install
   cp .env.example .env
   npm run dev
   ```
   Vite dev server proxies `/api` to the local API Gateway.

## Deploying to AWS

```
cd backend
sam build
sam deploy --guided
```
You'll be prompted for `PlaidClientId`, `PlaidSecret`, `PlaidEnv`, and `RentcastApiKey` — these become encrypted Lambda environment variables (AWS-managed KMS by default), never written to `template.yaml` or committed. Do **not** point `PlaidEnv` at `production` against the real Navy Federal accounts until that's explicitly confirmed — sandbox/development first.

## Status

**Backend** — all 15 Lambdas and 12 DynamoDB tables are defined in `template.yaml`: Plaid link/exchange/sync, accounts (incl. config editing), transactions, category rules (with dry-run testing), cashflow, spending plans, G1/G2/G3 trackers, PCS simulator, tasks, rentals proxy, and SNS reminders. Shared logic lives in `backend/shared/` (snowball projection, M&IE per-diem, categorization rules engine, Plaid sync).

**Frontend** — the "Industry" design system from the Claude Design mockup is ported into `frontend/src/styles/`, with a shared `AppShell` sidebar and every page wired to its API via TanStack Query hooks in `frontend/src/api/hooks.js`.

**Not yet verified** — none of this has been run: the local toolchain (Node, Docker, SAM CLI) isn't installed on this machine yet, so nothing has been built, invoked, or deployed. That's the next step.

Still to do: Plaid Link SDK in the browser (Settings currently only proves the backend can mint a link token), phone numbers for SNS reminder subscriptions, and a first `sam deploy`.

Sensitive personal documents (LES, credit reports, paystubs) are gitignored — keep them local only, and confirm the GitHub remote is private before pushing.
