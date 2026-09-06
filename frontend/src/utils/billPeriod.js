// Pay periods are calendar half-months: the 1st-14th and the 15th-EOM,
// matching the household's 1st/15th paydays. A period is identified by its
// start date, e.g. "2026-09-01" or "2026-09-15". Mirrors
// backend/shared/payPeriod.js.

export function getPeriod(dateIso) {
  const d = new Date(`${dateIso}T00:00:00`);
  const year = d.getFullYear();
  const monthIndex = d.getMonth();
  const month = String(monthIndex + 1).padStart(2, '0');
  const isFirstHalf = d.getDate() <= 14;
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();

  return {
    periodKey: `${year}-${month}-${isFirstHalf ? '01' : '15'}`,
    periodStart: `${year}-${month}-${isFirstHalf ? '01' : '15'}`,
    periodEnd: isFirstHalf ? `${year}-${month}-14` : `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
    isFirstHalf,
  };
}

export function currentPeriod() {
  return getPeriod(new Date().toISOString().slice(0, 10));
}

export function billFallsInPeriod(dayOfMonth, period) {
  if (!dayOfMonth || !period) return false;
  return period.isFirstHalf ? dayOfMonth <= 14 : dayOfMonth >= 15;
}

// Sums active, non-income bills by category for whichever land in the given
// pay period — used to pre-fill a new Spending Plan draft.
export function suggestAllocationsFromBills(bills, period) {
  const sums = {};
  for (const bill of bills) {
    if (bill.isActive === false) continue;
    if (bill.category === 'Income') continue;
    if (!billFallsInPeriod(bill.dayOfMonth, period)) continue;
    sums[bill.category] = (sums[bill.category] ?? 0) + Math.abs(bill.amount);
  }
  return Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, Math.round(v * 100) / 100]));
}

// Expected income for the period, from the income-type recurring bills.
export function suggestIncomeFromBills(bills, period) {
  return Math.round(
    bills
      .filter((b) => b.isActive !== false && b.amount > 0 && billFallsInPeriod(b.dayOfMonth, period))
      .reduce((sum, b) => sum + b.amount, 0) * 100
  ) / 100;
}
