// Car_Payment is scored as debt alongside Debt_Payment (see scorePlan in
// backend/functions/spending-plans/index.js) — the car notes are debt, they
// just deserve their own line. Childcare_Storage folded into Other.
export const CATEGORIES = [
  'Income',
  'Housing',
  'Home_Improvement',
  'Groceries',
  'Gas',
  'Dining',
  'Phone',
  'Utilities',
  'Internet',
  'Childcare',
  'Car_Payment',
  'Debt_Payment',
  'Shopping',
  'Entertainment',
  'Medical',
  'Subscriptions',
  'Other',
];
