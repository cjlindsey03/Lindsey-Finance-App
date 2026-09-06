const { queryByPK } = require('./db');

// Fallback map applied only when no user-defined rule matches.
const PLAID_CATEGORY_MAP = {
  'Food and Drink': 'Groceries',
  Shops: 'Shopping',
  Travel: 'Gas',
  Automotive: 'Gas',
  Payment: 'Debt_Payment',
  Transfer: null, // excluded from spending view
  Payroll: 'Income',
  Recreation: 'Entertainment',
  Healthcare: 'Medical',
  Service: 'Other',
};

function matchesRule(rule, transaction) {
  const field =
    rule.matchOn === 'merchantName'
      ? transaction.merchantName
      : rule.matchOn === 'description'
      ? transaction.description
      : null;

  if (rule.matchOn === 'amount') {
    const amount = transaction.amount;
    const min = rule.amountMin ?? -Infinity;
    const max = rule.amountMax ?? Infinity;
    return amount >= min && amount <= max;
  }

  if (!field) return false;
  const haystack = field.toLowerCase();
  const needle = (rule.matchValue || '').toLowerCase();

  switch (rule.matchType) {
    case 'contains':
      return haystack.includes(needle);
    case 'equals':
      return haystack === needle;
    case 'startsWith':
      return haystack.startsWith(needle);
    case 'endsWith':
      return haystack.endsWith(needle);
    case 'regex':
      return new RegExp(rule.matchValue, 'i').test(field);
    default:
      return false;
  }
}

async function loadActiveRules(tableName, householdId) {
  const rules = await queryByPK(tableName, householdId);
  return rules.filter((r) => r.isActive).sort((a, b) => a.priority - b.priority);
}

function resolveCategory(transaction, rules) {
  for (const rule of rules) {
    if (matchesRule(rule, transaction)) {
      return {
        resolvedCategory: rule.assignCategory,
        resolvedSubcategory: rule.assignSubcategory ?? null,
        matchedRuleId: rule.SK,
      };
    }
  }

  const plaidTopCategory = transaction.plaidCategory?.[0];
  const fallback = PLAID_CATEGORY_MAP[plaidTopCategory] ?? 'Other';
  return { resolvedCategory: fallback, resolvedSubcategory: null, matchedRuleId: null };
}

module.exports = { PLAID_CATEGORY_MAP, matchesRule, loadActiveRules, resolveCategory };
