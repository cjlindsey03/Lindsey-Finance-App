// The household is paid on the 1st and the 15th, so a pay period is a
// calendar half-month: the 1st-14th, or the 15th through the end of month.
// A period is identified by its start date, e.g. "2026-09-01" or "2026-09-15".

function lastDayOfMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function getPeriod(dateIso) {
  const d = new Date(`${dateIso}T00:00:00`);
  const year = d.getFullYear();
  const monthIndex = d.getMonth();
  const month = String(monthIndex + 1).padStart(2, '0');
  const firstHalf = d.getDate() <= 14;

  return {
    periodKey: `${year}-${month}-${firstHalf ? '01' : '15'}`,
    periodStart: `${year}-${month}-${firstHalf ? '01' : '15'}`,
    periodEnd: firstHalf
      ? `${year}-${month}-14`
      : `${year}-${month}-${String(lastDayOfMonth(year, monthIndex)).padStart(2, '0')}`,
    isFirstHalf: firstHalf,
  };
}

function currentPeriod() {
  return getPeriod(new Date().toISOString().slice(0, 10));
}

// The period after the one containing `dateIso`. Planning targets this: the
// goal is to have a plan ready before the paycheck lands, not to budget a
// period that's already half spent.
function nextPeriod(dateIso = new Date().toISOString().slice(0, 10)) {
  const period = getPeriod(dateIso);
  const end = new Date(`${period.periodEnd}T00:00:00`);
  end.setDate(end.getDate() + 1);
  return getPeriod(end.toISOString().slice(0, 10));
}

// Does a bill recurring on `dayOfMonth` fall inside this period?
function billFallsInPeriod(dayOfMonth, period) {
  if (!dayOfMonth) return false;
  return period.isFirstHalf ? dayOfMonth <= 14 : dayOfMonth >= 15;
}

module.exports = { getPeriod, currentPeriod, nextPeriod, billFallsInPeriod };
