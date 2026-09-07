const { get, put } = require('../../shared/db');
const { getHouseholdContext } = require('../../shared/auth');
const { ok } = require('../../shared/http');

const RENTALS_CACHE_TABLE = process.env.RENTALS_CACHE_TABLE;
const RENTCAST_API_KEY = process.env.RENTCAST_API_KEY;
const GOOGLE_STREETVIEW_KEY = process.env.GOOGLE_STREETVIEW_KEY;

// Camp Lejeune, NC — searched as a radius rather than a zip list so one API
// call covers Jacksonville and the surrounding towns (RentCast's free tier is
// request-capped, and the old version burned four calls per search).
const CAMP_LEJEUNE = { latitude: 34.6084, longitude: -77.4419 };
const SEARCH_RADIUS_MILES = 50;
const MIN_BEDROOMS = 4;
const MAX_RENT = 2300;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function fetchListings({ minBedrooms, maxRent }) {
  const url = new URL('https://api.rentcast.io/v1/listings/rental/long-term');
  url.searchParams.set('latitude', CAMP_LEJEUNE.latitude);
  url.searchParams.set('longitude', CAMP_LEJEUNE.longitude);
  url.searchParams.set('radius', SEARCH_RADIUS_MILES);
  url.searchParams.set('propertyType', 'Single Family');
  url.searchParams.set('status', 'Active');
  url.searchParams.set('bedrooms', String(minBedrooms));
  url.searchParams.set('limit', '200');

  const response = await fetch(url, { headers: { 'X-Api-Key': RENTCAST_API_KEY } });
  if (!response.ok) throw new Error(`RentCast responded ${response.status}`);
  const listings = await response.json();

  // RentCast documents range/multi-value support for these filters but not the
  // literal syntax, so the results are re-filtered here. A syntax mismatch can
  // then never surface a 2-bed or an over-budget listing.
  return (Array.isArray(listings) ? listings : [])
    .filter((l) => (l.bedrooms ?? 0) >= minBedrooms && (l.price ?? Infinity) <= maxRent);
}

// RentCast returns no photos and no listing URL — only property metadata plus
// coordinates. So the photo is Street View of the actual address, and the link
// is a constructed address search rather than a real listing page. The UI has
// to say so; pretending it's a listing link would be a lie.
function decorate(listing) {
  const { latitude, longitude, formattedAddress } = listing;

  const streetViewUrl =
    GOOGLE_STREETVIEW_KEY && latitude && longitude
      ? `https://maps.googleapis.com/maps/api/streetview?size=640x360&location=${latitude},${longitude}` +
        `&fov=80&pitch=0&key=${GOOGLE_STREETVIEW_KEY}`
      : null;

  const searchUrl = formattedAddress
    ? `https://www.google.com/search?q=${encodeURIComponent(`${formattedAddress} for rent`)}`
    : null;

  const mapUrl =
    latitude && longitude
      ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
      : null;

  return { ...listing, streetViewUrl, searchUrl, mapUrl, hasDirectListingUrl: false };
}

exports.handler = async (event) => {
  const { householdId } = getHouseholdContext(event);
  const query = event.queryStringParameters || {};
  const minBedrooms = Number(query.bedrooms) || MIN_BEDROOMS;
  const maxRent = Number(query.maxRent) || MAX_RENT;

  const key = `${minBedrooms}bd-${maxRent}`;
  const cached = await get(RENTALS_CACHE_TABLE, { PK: householdId, SK: key });
  if (cached && Date.now() - new Date(cached.cachedAt).getTime() < CACHE_TTL_MS) {
    return ok({
      listings: cached.listings.map(decorate),
      cachedAt: cached.cachedAt,
      fromCache: true,
      criteria: { minBedrooms, maxRent, radiusMiles: SEARCH_RADIUS_MILES },
    });
  }

  const listings = await fetchListings({ minBedrooms, maxRent });
  const cachedAt = new Date().toISOString();

  await put(RENTALS_CACHE_TABLE, {
    PK: householdId,
    SK: key,
    listings,
    cachedAt,
    expiresAt: Math.floor((Date.now() + CACHE_TTL_MS) / 1000),
  });

  return ok({
    listings: listings.map(decorate),
    cachedAt,
    fromCache: false,
    criteria: { minBedrooms, maxRent, radiusMiles: SEARCH_RADIUS_MILES },
  });
};
