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

Implemented so far: Cognito + DynamoDB (all 9 tables) + API Gateway skeleton in `template.yaml`, and the three Plaid-integration Lambdas (`plaid-link-create`, `plaid-exchange-token`, `plaid-sync`) with the categorization-rules engine and upcoming-payment prediction. Everything else in the [Build Order](Build%20Instructions.md#build-order-recommended) (accounts page, transactions, G1/G2/G3 trackers, cashflow calendar, spending plans, PCS simulator, tasks, rentals, reminders, settings) is not yet built — follow the spec's build order for what's next.

Sensitive personal documents (LES, credit reports, paystubs) are gitignored — keep them local only, and confirm the GitHub remote is private before pushing.
