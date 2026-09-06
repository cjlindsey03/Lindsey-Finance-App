const { randomUUID } = require('crypto');
const { queryByPK, get, put, del } = require('../../shared/db');
const { getHouseholdContext } = require('../../shared/auth');
const { ok, badRequest, notFound, noContent, parseBody } = require('../../shared/http');
const { matchesRule } = require('../../shared/categoryRules');

const CATEGORY_RULES_TABLE = process.env.CATEGORY_RULES_TABLE;
const TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE;

const toPublicRule = ({ PK, SK, ...rest }) => ({ ruleId: SK, ...rest });

async function listRules(householdId) {
  const rules = await queryByPK(CATEGORY_RULES_TABLE, householdId);
  rules.sort((a, b) => a.priority - b.priority);
  return ok({ rules: rules.map(toPublicRule) });
}

async function createRule(householdId, body) {
  if (!body?.matchOn || !body?.assignCategory) {
    return badRequest('matchOn and assignCategory are required');
  }

  const existing = await queryByPK(CATEGORY_RULES_TABLE, householdId);
  const nextPriority = existing.length
    ? Math.max(...existing.map((r) => r.priority ?? 0)) + 1
    : 1;

  const rule = {
    PK: householdId,
    SK: randomUUID(),
    priority: body.priority ?? nextPriority,
    matchOn: body.matchOn,
    matchType: body.matchType ?? 'contains',
    matchValue: body.matchValue ?? null,
    amountMin: body.amountMin ?? null,
    amountMax: body.amountMax ?? null,
    assignCategory: body.assignCategory,
    assignSubcategory: body.assignSubcategory ?? null,
    isActive: body.isActive ?? true,
  };
  await put(CATEGORY_RULES_TABLE, rule);
  return ok({ rule: toPublicRule(rule) });
}

async function updateRule(householdId, ruleId, body) {
  const existing = await get(CATEGORY_RULES_TABLE, { PK: householdId, SK: ruleId });
  if (!existing) return notFound('Rule not found');

  const updated = { ...existing, ...body, PK: householdId, SK: ruleId };
  await put(CATEGORY_RULES_TABLE, updated);
  return ok({ rule: toPublicRule(updated) });
}

// Dry-run a rule against the last 30 days so the user can see what it would
// catch before saving it.
async function testRule(householdId, body) {
  if (!body?.matchOn) return badRequest('matchOn is required');

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const transactions = await queryByPK(TRANSACTIONS_TABLE, householdId);
  const matches = transactions
    .filter((tx) => tx.date >= cutoffIso && matchesRule(body, tx))
    .map(({ PK, SK, ...rest }) => ({ transactionId: SK, ...rest }));

  return ok({ matchCount: matches.length, matches });
}

exports.handler = async (event) => {
  const { householdId } = getHouseholdContext(event);
  const method = event.requestContext?.http?.method || 'GET';
  const ruleId = event.pathParameters?.ruleId;
  const path = event.requestContext?.http?.path || '';

  if (method === 'GET') return listRules(householdId);

  const body = parseBody(event);
  if (method !== 'DELETE' && !body) return badRequest('Invalid JSON body');

  if (method === 'POST' && path.endsWith('/test')) return testRule(householdId, body);
  if (method === 'POST') return createRule(householdId, body);

  if (!ruleId) return badRequest('ruleId is required');
  if (method === 'PUT') return updateRule(householdId, ruleId, body);
  if (method === 'DELETE') {
    await del(CATEGORY_RULES_TABLE, { PK: householdId, SK: ruleId });
    return noContent();
  }

  return badRequest(`Unsupported method ${method}`);
};
