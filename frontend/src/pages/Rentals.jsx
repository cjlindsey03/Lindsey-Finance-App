import { useState } from 'react';
import BlueprintCard from '../components/BlueprintCard.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useRentals } from '../api/hooks.js';
import { money } from '../utils/format.js';

function ListingImage({ listing }) {
  const [failed, setFailed] = useState(false);

  const placeholder = (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-surface-2)',
        color: 'color-mix(in srgb, var(--color-text) 45%, transparent)',
        fontSize: 11,
        textAlign: 'center',
        padding: 'var(--space-3)',
      }}
    >
      No street view available
    </div>
  );

  return (
    <div style={{ width: 260, minWidth: 260, height: 170, overflow: 'hidden', border: '1px solid var(--color-divider)' }}>
      {listing.streetViewUrl && !failed ? (
        <img
          src={listing.streetViewUrl}
          alt={`Street view of ${listing.formattedAddress ?? 'listing'}`}
          loading="lazy"
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        placeholder
      )}
    </div>
  );
}

function ListingCard({ listing }) {
  return (
    <BlueprintCard style={{ flexDirection: 'row', gap: 'var(--space-4)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <ListingImage listing={listing} />

      <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <div className="card-title" style={{ fontSize: 18 }}>{listing.formattedAddress ?? 'Address unavailable'}</div>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 24, color: 'var(--color-accent)' }}>
            {money(listing.price)}<span className="text-muted" style={{ fontSize: 13 }}>/mo</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', fontSize: 13 }}>
          <span>{listing.bedrooms ?? '—'} bd</span>
          <span>{listing.bathrooms ?? '—'} ba</span>
          <span>{listing.squareFootage ? `${listing.squareFootage.toLocaleString()} sqft` : '— sqft'}</span>
          {listing.propertyType && <span className="text-muted">{listing.propertyType}</span>}
          {listing.daysOnMarket != null && (
            <span className="text-muted">{listing.daysOnMarket} days on market</span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'auto' }}>
          {listing.searchUrl && (
            <a className="btn btn-secondary" href={listing.searchUrl} target="_blank" rel="noreferrer">
              Search this address
            </a>
          )}
          {listing.mapUrl && (
            <a className="btn btn-ghost" href={listing.mapUrl} target="_blank" rel="noreferrer">
              Map
            </a>
          )}
        </div>
      </div>
    </BlueprintCard>
  );
}

export default function Rentals() {
  const [filters, setFilters] = useState({ bedrooms: '4', maxRent: '2300' });
  const { data, refetch, isFetching, isError, error } = useRentals(filters);

  const update = (key) => (e) => setFilters({ ...filters, [key]: e.target.value });
  const listings = data?.listings ?? [];

  return (
    <>
      <PageHeader title="Rentals" />

      <BlueprintCard>
        <div className="card-title">Search — within 50 miles of Camp Lejeune</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-3)', alignItems: 'end' }}>
          <div className="field">
            <label htmlFor="bedrooms">Bedrooms (minimum)</label>
            <input id="bedrooms" className="input" type="number" value={filters.bedrooms} onChange={update('bedrooms')} />
          </div>
          <div className="field">
            <label htmlFor="maxRent">Max monthly rent</label>
            <input id="maxRent" className="input" type="number" value={filters.maxRent} onChange={update('maxRent')} />
          </div>
          <button type="button" className="btn btn-primary" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? 'Searching…' : 'Search'}
          </button>
        </div>

        {/* Being straight about what these links are — the data source has no
            listing pages, so there is nowhere to link directly to. */}
        <p className="text-muted" style={{ fontSize: 11 }}>
          Photos are Google Street View of the address, not listing photos. The data source (RentCast) provides no
          direct listing links, so "Search this address" opens a web search for that property instead.
        </p>

        {/* A failed search must never be mistaken for "no houses matched". */}
        {isError && (
          <div style={{ fontSize: 12, color: 'var(--color-overspend)' }}>
            Search failed: {error?.message}
          </div>
        )}

        {data?.cachedAt && (
          <div className="text-muted" style={{ fontSize: 11 }}>
            {listings.length} match{listings.length === 1 ? '' : 'es'} · refreshed{' '}
            {new Date(data.cachedAt).toLocaleString()}
            {data.fromCache ? ' (cached)' : ''}
          </div>
        )}
      </BlueprintCard>

      {listings.length > 0 && (
        <div
          className="hf-scroll"
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxHeight: '70vh', overflowY: 'auto', paddingRight: 'var(--space-2)' }}
        >
          {listings.map((listing) => (
            <ListingCard key={listing.id ?? listing.formattedAddress} listing={listing} />
          ))}
        </div>
      )}

      {data && !listings.length && !isError && (
        <BlueprintCard><p className="card-body">No listings matched. Try widening the filters.</p></BlueprintCard>
      )}

      {!data && !isError && !isFetching && (
        <BlueprintCard><p className="card-body">Press Search to pull current listings.</p></BlueprintCard>
      )}
    </>
  );
}
