#!/usr/bin/env bash
# Creates all 9 tables in DynamoDB Local, matching backend/template.yaml.
# Requires: docker-compose -f backend/docker-compose.yml up -d (dynamodb-local on :8000)
set -euo pipefail

ENDPOINT="http://localhost:8000"
REGION="us-east-1"

create_simple_table() {
  local name=$1
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
  aws dynamodb create-table \
    --endpoint-url "$ENDPOINT" --region "$REGION" \
    --table-name "$name" \
    --attribute-definitions AttributeName=PK,AttributeType=S AttributeName=SK,AttributeType=S \
    --key-schema AttributeName=PK,KeyType=HASH AttributeName=SK,KeyType=RANGE \
    --billing-mode PAY_PER_REQUEST \
    >/dev/null && echo "created $name"
}

create_simple_table accounts
create_composite_table plaid_items
create_composite_table balance_snapshots
create_composite_table spending_plans
create_composite_table pcs_simulations
create_composite_table tasks
create_composite_table g3_tracker
create_simple_table g2_tracker
create_simple_table category_rules

aws dynamodb create-table \
  --endpoint-url "$ENDPOINT" --region "$REGION" \
  --table-name transactions \
  --attribute-definitions AttributeName=PK,AttributeType=S AttributeName=SK,AttributeType=S AttributeName=accountId,AttributeType=S AttributeName=date,AttributeType=S \
  --key-schema AttributeName=PK,KeyType=HASH AttributeName=SK,KeyType=RANGE \
  --global-secondary-indexes '[{"IndexName":"accountId-date-index","KeySchema":[{"AttributeName":"accountId","KeyType":"HASH"},{"AttributeName":"date","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}]' \
  --billing-mode PAY_PER_REQUEST \
  >/dev/null && echo "created transactions"

aws dynamodb create-table \
  --endpoint-url "$ENDPOINT" --region "$REGION" \
  --table-name cashflow_events \
  --attribute-definitions AttributeName=PK,AttributeType=S AttributeName=SK,AttributeType=S AttributeName=eventDate,AttributeType=S \
  --key-schema AttributeName=PK,KeyType=HASH AttributeName=SK,KeyType=RANGE \
  --global-secondary-indexes '[{"IndexName":"householdId-eventDate-index","KeySchema":[{"AttributeName":"PK","KeyType":"HASH"},{"AttributeName":"eventDate","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}]' \
  --billing-mode PAY_PER_REQUEST \
  >/dev/null && echo "created cashflow_events"

echo "All tables created."
