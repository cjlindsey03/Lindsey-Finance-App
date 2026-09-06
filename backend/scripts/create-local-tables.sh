#!/usr/bin/env bash
# Creates all 10 tables in DynamoDB Local, matching backend/template.yaml.
# Requires: docker-compose -f backend/docker-compose.yml up -d (dynamodb-local on :8000)
set -euo pipefail

ENDPOINT="http://localhost:8000"
REGION="us-east-1"

# DynamoDB Local ignores credentials, but the CLI still demands some; these
# dummy values keep it from trying to resolve real (possibly expired) ones.
export AWS_ACCESS_KEY_ID=local
export AWS_SECRET_ACCESS_KEY=local
export AWS_DEFAULT_REGION="$REGION"
unset AWS_PROFILE

table_exists() {
  aws dynamodb describe-table --endpoint-url "$ENDPOINT" --region "$REGION"     --table-name "$1" >/dev/null 2>&1
}

create_simple_table() {
  local name=$1
  if table_exists "$name"; then echo "exists  $name"; return 0; fi
  aws dynamodb create-table \
    --endpoint-url "$ENDPOINT" --region "$REGION" \
    --table-name "$name" \
    --attribute-definitions AttributeName=PK,AttributeType=S \
    --key-schema AttributeName=PK,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    >/dev/null && echo "created $name"
}

create_composite_table() {
  local name=$1
  if table_exists "$name"; then echo "exists  $name"; return 0; fi
  aws dynamodb create-table \
    --endpoint-url "$ENDPOINT" --region "$REGION" \
    --table-name "$name" \
    --attribute-definitions AttributeName=PK,AttributeType=S AttributeName=SK,AttributeType=S \
    --key-schema AttributeName=PK,KeyType=HASH AttributeName=SK,KeyType=RANGE \
    --billing-mode PAY_PER_REQUEST \
    >/dev/null && echo "created $name"
}

create_composite_table accounts
create_composite_table balance_snapshots
create_composite_table spending_plans
create_composite_table pcs_simulations
create_composite_table tasks
create_composite_table g3_tracker
create_composite_table rentals_cache
create_simple_table g2_tracker
create_composite_table recurring_bills
create_composite_table reports

if table_exists cashflow_events; then echo "exists  cashflow_events"; else
aws dynamodb create-table \
  --endpoint-url "$ENDPOINT" --region "$REGION" \
  --table-name cashflow_events \
  --attribute-definitions AttributeName=PK,AttributeType=S AttributeName=SK,AttributeType=S AttributeName=eventDate,AttributeType=S \
  --key-schema AttributeName=PK,KeyType=HASH AttributeName=SK,KeyType=RANGE \
  --global-secondary-indexes '[{"IndexName":"householdId-eventDate-index","KeySchema":[{"AttributeName":"PK","KeyType":"HASH"},{"AttributeName":"eventDate","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}]' \
  --billing-mode PAY_PER_REQUEST \
  >/dev/null && echo "created cashflow_events"
fi

echo "All tables created."
