const { get, put } = require('./db');

// Reuses the rentals cache table — it's a generic key/value store with a TTL
// attribute already wired up, and standing up a second table for one row a day
// isn't worth it. The name is a leftover from its first use.
const CACHE_TABLE = process.env.RENTALS_CACHE_TABLE;
const EIA_API_KEY = process.env.EIA_API_KEY;

const CACHE_KEY = 'gas-prices';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Last-resort values if EIA is unreachable and nothing is cached. Set from the
// 2026-08-31 weekly release so a fallback is at least in the right era; the
// response records which source was actually used.
const FALLBACK = { low: 3.62, mid: 4.07, high: 5.21, asOf: '2026-08-31', source: 'fallback' };

// Weekly retail regular gasoline (product EPMR). NUS is the national average;
// R10-R50 are the five PADD refining regions, which is where the real spread
// between cheap and expensive parts of a cross-country route shows up.
const NATIONAL = 'NUS';
const PADD_REGIONS = ['R10', 'R20', 'R30', 'R40', 'R50'];

function buildUrl() {
  const params = new URLSearchParams({
    api_key: EIA_API_KEY,
    frequency: 'weekly',
    'data[0]': 'value',
    'facets[product][]': 'EPMR',
    'sort[0][column]': 'period',
    'sort[0][direction]': 'desc',
    length: '40',
  });
  return `https://api.eia.gov/v2/petroleum/pri/gnd/data/?${params.toString()}`;
}

async function fetchFromEia() {
  const response = await fetch(buildUrl());
  if (!response.ok) throw new Error(`EIA responded ${response.status}`);

  const rows = (await response.json())?.response?.data ?? [];
  if (!rows.length) throw new Error('EIA returned no rows');

  // Rows come back newest-first; keep only the most recent week so a partially
  // published release can't mix two weeks into one comparison.
  const latestPeriod = rows[0].period;
  const week = rows.filter((r) => r.period === latestPeriod);

  const national = week.find((r) => r.duoarea === NATIONAL)?.value;
  const paddPrices = week
    .filter((r) => PADD_REGIONS.includes(r.duoarea))
    .map((r) => Number(r.value))
    .filter((v) => Number.isFinite(v));

  if (!national || !paddPrices.length) throw new Error('EIA response missing expected regions');

  return {
    low: Math.min(...paddPrices),
    mid: Number(national),
    high: Math.max(...paddPrices),
    asOf: latestPeriod,
    source: 'eia',
  };
}

// Never throws: a gas-price lookup failing should degrade the estimate, not
// take down a PCS calculation.
async function getGasPrices() {
  let cached = null;
  try {
    cached = await get(CACHE_TABLE, { PK: 'lindsey-001', SK: CACHE_KEY });
    if (cached && Date.now() - new Date(cached.cachedAt).getTime() < CACHE_TTL_MS) {
      return { ...cached.prices, source: 'cache' };
    }
  } catch (err) {
    console.error('gas price cache read failed:', err.message);
  }

  try {
    const prices = await fetchFromEia();
    await put(CACHE_TABLE, {
      PK: 'lindsey-001',
      SK: CACHE_KEY,
      prices,
      cachedAt: new Date().toISOString(),
      expiresAt: Math.floor((Date.now() + CACHE_TTL_MS) / 1000),
    });
    return prices;
  } catch (err) {
    console.error('EIA fetch failed:', err.message);
    // A stale cache still beats a made-up number.
    if (cached?.prices) return { ...cached.prices, source: 'stale-cache' };
    return FALLBACK;
  }
}

function priceForTier(prices, tier) {
  return prices[tier] ?? prices.mid;
}

module.exports = { getGasPrices, priceForTier, FALLBACK };
