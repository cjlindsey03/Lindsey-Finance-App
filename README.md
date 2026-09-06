# Lindsey Household Finance App

Two-user household financial dashboard. Full spec: [`Build Instructions.md`](Build%20Instructions.md).

## Repo layout

```
backend/    AWS SAM app — 15 Lambdas, 12 DynamoDB tables, Cognito
frontend/   Vite + React SPA (installable PWA)
```

> **This repo must live on a local disk.** npm cannot install into Google Drive's
> virtual filesystem (`G:`) — it fails with `EBADF`. The canonical working copy is
> `C:\dev\Lindsey-Finance-App`; GitHub is the sync/backup.

## One-time setup

Node 20+, Docker Desktop, AWS SAM CLI, and esbuild on PATH (`npm install -g esbuild` —
the bundle step shells out to it).

## Local development (Plaid sandbox, no AWS needed)

```bash
# 1. DynamoDB Local + tables (idempotent, safe to re-run)
cd backend
docker compose up -d
bash scripts/create-local-tables.sh

# 2. Secrets: copy the template and fill in your Plaid sandbox keys
cp env.local.json.example env.local.json

# 3. Seed the household's known accounts, bills, and G2 goal
npm install
npm run seed

# 4. Bundle the Lambdas and start the API on :3000
npm run build          # = npm run bundle && sam build
sam local start-api --env-vars env.local.json --docker-network sam-local

# 5. Frontend on :5173 (separate terminal)
cd ../frontend
npm install
cp .env.example .env   # set VITE_API_URL=/api and VITE_AUTH_MODE=local
npm run dev
```

`VITE_AUTH_MODE=local` skips Cognito (which can't run offline) and `VITE_API_URL=/api`
routes calls through Vite's proxy so they're same-origin. The backend mirrors this:
`shared/auth.js` assumes the one household when `AWS_SAM_LOCAL` is set.

Invoke a single function without the API:

```bash
sam local invoke G1TrackerFunction -e functions/g1-tracker/test-events/get.json \
  --env-vars env.local.json --docker-network sam-local
```

## Deploying to AWS

```bash
cd backend
npm run build
sam deploy --guided
```

You'll be prompted for `PlaidClientId`, `PlaidSecret`, `PlaidEnv`, `RentcastApiKey`,
and `AllowedOrigin` (the deployed SPA's URL — leave `*` only for testing). These become
encrypted Lambda environment variables; they are never committed. Keep `PlaidEnv` on
`sandbox` until you deliberately move to real bank data.

Note: `~/.aws/config` currently defaults to `us-west-1` and its login session is the
account **root** user. Create a scoped IAM user before deploying, and pick the region
deliberately — the table names are global to the account/region pair.

## Status

**Verified working** (run locally against DynamoDB Local + Plaid sandbox):

- `sam build` succeeds; all 15 Lambdas bundle to 6.6 MB total
- 9 GET and 3 write endpoints return 200 over HTTP
- All 12 pages render with zero console errors at 344 / 390 / 884 / 1440 px
- Snowball projection, cashflow running balance, utilization math, PCS profit
  model, and task completion all produce correct results on the household's real numbers

**Blocked:** the Plaid keys in `env.local.json` are rejected by Plaid with
`INVALID_API_KEYS`. The integration code is correct — it reaches Plaid and gets a
well-formed reply — so this needs a valid **Sandbox** client ID/secret from the Plaid
dashboard (secrets are per-environment; a Production secret will not work in Sandbox).

**Not built yet:** Plaid Link in the browser (Settings only proves the backend can mint
a link token), SNS phone-number subscriptions for reminders, and the first AWS deploy.
