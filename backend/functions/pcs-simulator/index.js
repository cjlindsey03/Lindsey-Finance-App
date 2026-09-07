const { randomUUID } = require('crypto');
const { queryByPK, get, put, del } = require('../../shared/db');
const { getHouseholdContext } = require('../../shared/auth');
const { ok, badRequest, notFound, noContent, parseBody } = require('../../shared/http');
const { getGasPrices, priceForTier } = require('../../shared/gasPrices');
const {
  MALT_RATE_PER_MILE,
  PER_DIEM_MEMBER_DAILY,
  PPM_TAX_WITHHOLDING,
  estimateGcc,
  dlaFor,
  weightAllowanceFor,
  dependentPerDiem,
} = require('../../shared/pcsRates');

const PCS_SIMULATIONS_TABLE = process.env.PCS_SIMULATIONS_TABLE;

const TRUCK_MPG = { '10ft': 12, '15ft': 10, '20ft': 10, '26ft': 8 };
const DAILY_FOOD_BUDGET = 120;

const round = (n) => Math.round(n * 100) / 100;

async function calculateResults(input) {
  const {
    grade = 'O1',
    hasDependents = true,
    // Spouse (25) and infant daughter. Ages drive the 75%/50% per-diem split.
    dependentAges = [25, 0],

    truckType = '26ft',
    // One quoted figure for the whole rental rather than separate daily and
    // per-mile rates — that's how the rental companies actually quote it.
    quotedTruckRental = 0,
    materialCost = 0,
    hotelStops = [],

    routeMiles = 2800,
    tripDays = 4,
    // The member and dependents can be paid different numbers of travel days
    // (they were on the last move: 8 vs 7), so they're tracked separately.
    memberTravelDays,
    dependentTravelDays,
    povCount = 1,

    estimatedHHGWeight = 0,
    // The real Government Constructed Cost from TMO/MilMove, once known.
    // Always preferred over the estimate when present.
    actualGcc,

    gasPriceTier = 'mid',
    gasPricePerGallon,
    truckMPG = TRUCK_MPG[truckType] ?? 10,
    povMPG = 18,
    dailyFoodBudget = DAILY_FOOD_BUDGET,
  } = input;

  const memberDays = memberTravelDays ?? tripDays;
  const dependentDays = dependentTravelDays ?? tripDays;

  // Live weekly EIA prices unless a specific price is supplied.
  const gasPrices = await getGasPrices();
  const gasPrice = gasPricePerGallon ?? priceForTier(gasPrices, gasPriceTier);

  // --- Costs you actually pay ---
  const fuelCostTruck = (routeMiles / truckMPG) * gasPrice;
  const fuelCostPov = (routeMiles / povMPG) * gasPrice;
  const hotelCost = hotelStops.reduce((sum, s) => sum + (s.nights ?? 0) * (s.costPerNight ?? 0), 0);
  const foodCost = dailyFoodBudget * tripDays;
  const totalExpenses = quotedTruckRental + fuelCostTruck + fuelCostPov + hotelCost + foodCost + materialCost;

  // --- PPM incentive ---
  // Paid on the lesser of what you actually move and your authorized allowance.
  const weightAllowance = weightAllowanceFor(grade, hasDependents);
  const billableWeight = Math.min(estimatedHHGWeight, weightAllowance);
  const gcc = actualGcc != null ? Number(actualGcc) : estimateGcc(billableWeight, routeMiles);
  const taxableProfit = gcc - totalExpenses;
  // Withholding only applies to profit — a loss isn't taxed.
  const taxWithheld = taxableProfit > 0 ? taxableProfit * PPM_TAX_WITHHOLDING : 0;
  const netPPMProfit = gcc - taxWithheld - totalExpenses;

  // --- Entitlements paid on top, regardless of the PPM ---
  const dla = dlaFor(grade, hasDependents);
  const malt = MALT_RATE_PER_MILE * routeMiles * povCount;
  const memberPerDiem = PER_DIEM_MEMBER_DAILY * memberDays;
  const depPerDiem = hasDependents ? dependentPerDiem(dependentAges, dependentDays) : 0;
  const totalEntitlements = dla + malt + memberPerDiem + depPerDiem;

  return {
    weightAllowance,
    billableWeight,
    weightOverAllowance: Math.max(0, estimatedHHGWeight - weightAllowance),

    quotedTruckRental: round(quotedTruckRental),
    fuelCost_truck: round(fuelCostTruck),
    fuelCost_pov: round(fuelCostPov),
    hotelCost: round(hotelCost),
    foodCost: round(foodCost),
    materialCost: round(materialCost),
    totalExpenses: round(totalExpenses),

    govConstructiveCost: round(gcc),
    gccIsEstimate: actualGcc == null,
    taxableProfit: round(taxableProfit),
    taxWithheld: round(taxWithheld),
    netPPMProfit: round(netPPMProfit),

    dla: round(dla),
    malt: round(malt),
    memberPerDiem: round(memberPerDiem),
    dependentPerDiem: round(depPerDiem),
    totalEntitlements: round(totalEntitlements),

    totalNetToHousehold: round(netPPMProfit + totalEntitlements),

    gasPricePerGallon: round(gasPrice),
    gasPriceSource: gasPrices.source,
    gasPriceAsOf: gasPrices.asOf,
  };
}

exports.handler = async (event) => {
  const { householdId } = getHouseholdContext(event);
  const method = event.requestContext?.http?.method || 'GET';
  const simulationId = event.pathParameters?.simulationId;

  if (method === 'GET') {
    if (simulationId) {
      const simulation = await get(PCS_SIMULATIONS_TABLE, { PK: householdId, SK: simulationId });
      if (!simulation) return notFound('Simulation not found');
      const { PK, SK, ...rest } = simulation;
      return ok({ simulation: { simulationId: SK, ...rest } });
    }

    const simulations = await queryByPK(PCS_SIMULATIONS_TABLE, householdId);
    simulations.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    return ok({
      simulations: simulations.map(({ PK, SK, ...rest }) => ({ simulationId: SK, ...rest })),
    });
  }

  if (method === 'DELETE') {
    if (!simulationId) return badRequest('simulationId is required');
    await del(PCS_SIMULATIONS_TABLE, { PK: householdId, SK: simulationId });
    return noContent();
  }

  const body = parseBody(event);
  if (!body) return badRequest('Invalid JSON body');

  const results = await calculateResults(body);

  // A run without a label is a live calculation — only save named runs.
  if (!body.label) return ok({ results });

  const id = `${Date.now()}-${randomUUID()}`;
  const simulation = { PK: householdId, SK: id, ...body, results, createdAt: new Date().toISOString() };
  await put(PCS_SIMULATIONS_TABLE, simulation);

  const { PK, SK, ...rest } = simulation;
  return ok({ simulation: { simulationId: SK, ...rest } });
};

module.exports.calculateResults = calculateResults;
