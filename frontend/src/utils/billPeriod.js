const PERIOD_DAYS = 14;

// Does a bill recurring on `dayOfMonth` land within the 14-day pay period
// starting at `payDate`? Checks the month before/of/after the pay date so
// periods that cross a month boundary (e.g. a plan starting the 24th) still
// catch bills in the following month, clamping short months (Feb 30 -> 28).
export function billOccursInPeriod(dayOfMonth, payDate) {
  if (!dayOfMonth || !payDate) return false;

  const start = new Date(`${payDate}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + (PERIOD_DAYS - 1));

  for (const monthOffset of [-1, 0, 1]) {
    const candidate = new Date(start.getFullYear(), start.getMonth() + monthOffset, 1);
    const lastDayOfMonth = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate();
    candidate.setDate(Math.min(dayOfMonth, lastDayOfMonth));
    if (candidate >= start && candidate <= end) return true;
  }
  return false;
}

// Sums active, non-income bills by category for whichever land in the pay
// period starting at payDate — used to pre-fill a new Spending Plan.
export function suggestAllocationsFromBills(bills, payDate) {
  const sums = {};
  for (const bill of bills) {
    if (bill.isActive === false) continue;
    if (bill.category === 'Income') continue;
    if (!billOccursInPeriod(bill.dayOfMonth, payDate)) continue;
    sums[bill.category] = (sums[bill.category] ?? 0) + Math.abs(bill.amount);
  }
  return Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, Math.round(v * 100) / 100]));
}
