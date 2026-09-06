// Meals & incidental expenses for a PCS travel leg.
// First and last travel days pay 75% of the daily rate; travelers beyond the
// primary also pay 75% (JTR convention).
const CONUS_STANDARD_MIE = 68;

function calculateMIE(tripDays, travelers, dailyRate = CONUS_STANDARD_MIE) {
  if (tripDays <= 0 || travelers <= 0) return 0;

  const fullDays = Math.max(0, tripDays - 2);
  const partialDays = Math.min(tripDays, 2);
  const primaryTotal = fullDays * dailyRate + partialDays * dailyRate * 0.75;
  const additionalTravelers = travelers - 1;

  return Math.round((primaryTotal + additionalTravelers * primaryTotal * 0.75) * 100) / 100;
}

module.exports = { calculateMIE, CONUS_STANDARD_MIE };
