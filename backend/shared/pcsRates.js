// PCS entitlement rates and the PPM cost model.
//
// Every figure here is either published policy or confirmed against this
// household's own settled vouchers from the Quantico VA -> Twentynine Palms CA
// move (DOV 842599 / 848237 / 839324, paid Jul 2026). Where a voucher confirms
// a number, that's noted — those are the ones we know are right rather than
// merely plausible.

// --- Dislocation Allowance -------------------------------------------------
// CY2026 rates, effective 1 Jan 2026 (JTR / PDTATAC).
// CONFIRMED: voucher 848237 paid exactly $3,085.23 for O-1 with dependents.
const DLA_RATES = {
  O1: { withDependents: 3085.23, withoutDependents: 2273.82 },
  O2: { withDependents: 3451.28, withoutDependents: 2700.31 },
  O3: { withDependents: 4041.88, withoutDependents: 3404.11 },
};

// --- PCS travel per diem ---------------------------------------------------
// FY2026 CONUS standard: $178/day for the member ($110 lodging + $68 M&IE).
// Dependents 12 and over draw 75%, under 12 draw 50%.
// CONFIRMED twice: voucher 842599 paid 8 x $178.00 = $1,424.00 to the member;
// voucher 848237 paid 7 x ($133.50 + $89.00) = $1,557.50 for spouse + infant.
// Note the member and dependents can travel a different number of days — they
// did on that move — so the two are calculated separately.
const PER_DIEM_MEMBER_DAILY = 178.0;
const DEPENDENT_RATE_12_AND_OVER = 0.75;
const DEPENDENT_RATE_UNDER_12 = 0.5;

// --- MALT (monetary allowance in lieu of transportation) -------------------
// $0.235/mile as of 1 Jul 2026, paid per authorized POV on the official DTOD
// distance (not your odometer). Up to two POVs.
// Voucher 842599 paid $516.40 at the previous $0.205 rate, implying ~2,519
// official miles for Quantico -> Twentynine Palms.
const MALT_RATE_PER_MILE = 0.235;

// --- PCS weight allowance --------------------------------------------------
// JTR Table 5-37. CONFIRMED: voucher 839324 shows "AUTHORIZED PPM WEIGHT: 12000".
const WEIGHT_ALLOWANCES = {
  O1: { withDependents: 12000, withoutDependents: 10000 },
  O2: { withDependents: 13500, withoutDependents: 12500 },
  O3: { withDependents: 14500, withoutDependents: 13000 },
};

// --- PPM incentive ---------------------------------------------------------
// The incentive is 100% of the Government Constructed Cost, and 22% federal
// tax is withheld on the profit remaining after documented expenses.
// CONFIRMED: voucher 839324 — GCC $6,068.51, expenses $771.73, paid $4,903.22.
// $6,068.51 - $771.73 = $5,296.78 profit; 22% = $1,165.29; $6,068.51 -
// $1,165.29 = $4,903.22 exactly.
const PPM_INCENTIVE_RATE = 1.0;
const PPM_TAX_WITHHOLDING = 0.22;

// --- Government Constructed Cost estimate ----------------------------------
// The real GCC comes from DoD contract rate tables by lane, weight and season,
// computed by TMO/MilMove. There is no public API for it, so this is a fitted
// estimate — always prefer the real figure when TMO provides one.
//
// A flat per-pound-per-mile factor does not work: freight rates fall steeply
// as weight rises. Two known points:
//   * 2,440 lb over ~2,519 mi -> $6,068.51  (voucher 839324) = $0.000987/lb-mi
//   * 9,000 lb over ~2,900 mi -> $11,000    (published example) = $0.00042/lb-mi
//
// Fitting GCC = miles x (A + B x weight) to both gives the constants below and
// reproduces each within a dollar.
//
// Limitations, stated plainly: two data points, both CONUS long-haul, one of
// them a third-party example rather than a settled voucher. Expect this to be
// least reliable for short moves, very heavy shipments, or unusual lanes —
// published guidance puts constructed-cost estimates at roughly +/-25%.
const GCC_FIXED_PER_MILE = 1.894;
const GCC_PER_LB_PER_MILE = 0.000211;

function estimateGcc(billableWeightLbs, routeMiles) {
  if (!billableWeightLbs || !routeMiles) return 0;
  return routeMiles * (GCC_FIXED_PER_MILE + GCC_PER_LB_PER_MILE * billableWeightLbs);
}

function dlaFor(grade = 'O1', hasDependents = true) {
  const row = DLA_RATES[grade] ?? DLA_RATES.O1;
  return hasDependents ? row.withDependents : row.withoutDependents;
}

function weightAllowanceFor(grade = 'O1', hasDependents = true) {
  const row = WEIGHT_ALLOWANCES[grade] ?? WEIGHT_ALLOWANCES.O1;
  return hasDependents ? row.withDependents : row.withoutDependents;
}

// Dependents are passed as ages so the 75%/50% split is explicit rather than
// hardcoded to this family's current composition.
function dependentPerDiem(dependentAges = [], travelDays = 0) {
  return dependentAges.reduce((sum, age) => {
    const rate = age >= 12 ? DEPENDENT_RATE_12_AND_OVER : DEPENDENT_RATE_UNDER_12;
    return sum + PER_DIEM_MEMBER_DAILY * rate * travelDays;
  }, 0);
}

module.exports = {
  DLA_RATES,
  WEIGHT_ALLOWANCES,
  PER_DIEM_MEMBER_DAILY,
  DEPENDENT_RATE_12_AND_OVER,
  DEPENDENT_RATE_UNDER_12,
  MALT_RATE_PER_MILE,
  PPM_INCENTIVE_RATE,
  PPM_TAX_WITHHOLDING,
  GCC_FIXED_PER_MILE,
  GCC_PER_LB_PER_MILE,
  estimateGcc,
  dlaFor,
  weightAllowanceFor,
  dependentPerDiem,
};
