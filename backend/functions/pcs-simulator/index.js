const { randomUUID } = require('crypto');
const { queryByPK, get, put, del } = require('../../shared/db');
const { getHouseholdContext } = require('../../shared/auth');
const { ok, badRequest, notFound, noContent, parseBody } = require('../../shared/http');
const { calculateMIE } = require('../../shared/mie');

const PCS_SIMULATIONS_TABLE = process.env.PCS_SIMULATIONS_TABLE;

const TRUCK_MPG = { '10ft': 12, '15ft': 10, '20ft': 10, '26ft': 8 };
const GAS_TIERS = { low: 3.0, mid: 3.5, high: 4.0 };
const DEFAULT_PPM_RATE_PER_LB_PER_MILE = 0.00037;

function calculateResults(input) {
  const {
    truckType = '26ft',
    truckDailyRate = 0,
    truckMileageRate = 0,
    towCost = 0,
    routeMiles = 2800,
    tripDays = 1,
    travelers = 1,
    hotelStops = [],
    materialWeightLbs = 0,
    materialCost = 0,
    estimatedHHGWeight = 0,
    gasPriceTier = 'mid',
    gasPricePerGallon,
    truckMPG = TRUCK_MPG[truckType] ?? 10,
    povMPG = 18,
    dlaAmount = 2366,
    govPPMRatePerLbPerMile = DEFAULT_PPM_RATE_PER_LB_PER_MILE,
  } = input;

  const gasPrice = gasPricePerGallon ?? GAS_TIERS[gasPriceTier] ?? GAS_TIERS.mid;

  const totalWeight = estimatedHHGWeight + materialWeightLbs;
  const truckRentalCost = truckDailyRate * tripDays + truckMileageRate * routeMiles;
  const fuelCostTruck = (routeMiles / truckMPG) * gasPrice;
  const fuelCostPov = (routeMiles / povMPG) * gasPrice;
  const hotelCost = hotelStops.reduce((sum, s) => sum + (s.nights ?? 0) * (s.costPerNight ?? 0), 0);
  const foodCost = calculateMIE(tripDays, travelers);

  const totalExpenses =
    truckRentalCost + towCost + fuelCostTruck + fuelCostPov + hotelCost + foodCost + materialCost;

  const govConstructiveCost = totalWeight * govPPMRatePerLbPerMile * routeMiles;
  const grossPPMProfit = govConstructiveCost - totalExpenses;
  const taxReserve22Pct = grossPPMProfit * 0.22;
  const netPPMProfit = grossPPMProfit * 0.78;

  const round = (n) => Math.round(n * 100) / 100;

  return {
    totalWeight,
    truckRentalCost: round(truckRentalCost),
    towCost: round(towCost),
    fuelCost_truck: round(fuelCostTruck),
    fuelCost_pov: round(fuelCostPov),
    hotelCost: round(hotelCost),
    foodCost: round(foodCost),
    materialCost: round(materialCost),
    totalExpenses: round(totalExpenses),
    govConstructiveCost: round(govConstructiveCost),
    grossPPMProfit: round(grossPPMProfit),
    taxReserve22Pct: round(taxReserve22Pct),
    netPPMProfit: round(netPPMProfit),
    dlaAmount,
    totalNetToHousehold: round(netPPMProfit + dlaAmount),
    gasPricePerGallon: gasPrice,
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

  const results = calculateResults(body);

  // A run without a label is a live calculation — only save named runs.
  if (!body.label) return ok({ results });

  const id = `${Date.now()}-${randomUUID()}`;
  const simulation = { PK: householdId, SK: id, ...body, results, createdAt: new Date().toISOString() };
  await put(PCS_SIMULATIONS_TABLE, simulation);

  const { PK, SK, ...rest } = simulation;
  return ok({ simulation: { simulationId: SK, ...rest } });
};
