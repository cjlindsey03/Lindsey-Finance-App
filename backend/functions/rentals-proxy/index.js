const { get, put } = require('../../shared/db');
const { getHouseholdContext } = require('../../shared/auth');
const { ok } = require('../../shared/http');

const RENTALS_CACHE_TABLE = process.env.RENTALS_CACHE_TABLE;
const RENTCAST_API_KEY = process.env.RENTCAST_API_KEY;

// Camp Lejeune / Jacksonville NC area.
const ZIP_CODES = ['28540', '28541', '28546', '28547'];
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function fetchListings(zipCode, { bedrooms, bathrooms, maxRent }) {
  const url = new URL('https://api.rentcast.io/v1/listings/rental/long-term');
  url.searchParams.set('zipCode', zipCode);
  url.searchParams.set('status', 'Active');
  if (bedrooms) url.searchParams.set('bedrooms', bedrooms);
  if (bathrooms) url.searchParams.set('bathrooms', bathrooms);

  const response = await fetch(url, { headers: { 'X-Api-Key': RENTCAST_API_KEY } });
  if (!response.ok) throw new Error(`RentCast responded ${response.status}`);

  const listings = await response.json();
  return maxRent ? listings.filter((l) => (l.price ?? 0) <= Number(maxRent)) : listings;
}

exports.handler = async (event) => {
  const { householdId } = getHouseholdContext(event);
  const query = event.queryStringParameters || {};
  const key = new URLSearchParams(query).toString() || 'default';

  const cached = await get(RENTALS_CACHE_TABLE, { PK: householdId, SK: key });
  if (cached && Date.now() - new Date(cached.cachedAt).getTime() < CACHE_TTL_MS) {
    return ok({ listings: cached.listings, cachedAt: cached.cachedAt, fromCache: true });
  }

  const results = await Promise.all(
    ZIP_CODES.map((zip) => fetchListings(zip, query).catch(() => []))
  );
  const listings = results.flat();
  const cachedAt = new Date().toISOString();

  await put(RENTALS_CACHE_TABLE, {
    PK: householdId,
    SK: key,
    listings,
    cachedAt,
    expiresAt: Math.floor((Date.now() + CACHE_TTL_MS) / 1000),
  });

  return ok({ listings, cachedAt, fromCache: false });
};
