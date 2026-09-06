import { useState } from 'react';
import BlueprintCard from '../components/BlueprintCard.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useRentals } from '../api/hooks.js';
import { money } from '../utils/format.js';

export default function Rentals() {
  const [filters, setFilters] = useState({ bedrooms: '3', bathrooms: '2', maxRent: '2200' });
  const { data, refetch, isFetching } = useRentals(filters);

  const update = (key) => (e) => setFilters({ ...filters, [key]: e.target.value });

  return (
    <>
      <PageHeader title="Rentals" />

      <BlueprintCard>
        <div className="card-title">Search — Camp Lejeune Area</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-3)', alignItems: 'end' }}>
          <div className="field">
            <label htmlFor="bedrooms">Bedrooms</label>
            <input id="bedrooms" className="input" type="number" value={filters.bedrooms} onChange={update('bedrooms')} />
          </div>
          <div className="field">
            <label htmlFor="bathrooms">Bathrooms</label>
            <input id="bathrooms" className="input" type="number" value={filters.bathrooms} onChange={update('bathrooms')} />
          </div>
          <div className="field">
            <label htmlFor="maxRent">Max rent</label>
            <input id="maxRent" className="input" type="number" value={filters.maxRent} onChange={update('maxRent')} />
          </div>
          <button type="button" className="btn btn-primary" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? 'Searching…' : 'Search'}
          </button>
        </div>
        {data?.cachedAt && (
          <div className="text-muted" style={{ fontSize: 11 }}>
            Last refreshed {new Date(data.cachedAt).toLocaleString()}
            {data.fromCache ? ' (cached)' : ''}
          </div>
        )}
      </BlueprintCard>

      {data?.listings?.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--space-4)' }}>
          {data.listings.map((listing) => (
            <BlueprintCard key={listing.id ?? listing.formattedAddress} style={{ gap: 'var(--space-2)' }}>
              <div className="card-kicker">{money(listing.price)} / mo</div>
              <div className="card-title" style={{ fontSize: 15 }}>{listing.formattedAddress}</div>
              <div className="text-muted" style={{ fontSize: 12 }}>
                {listing.bedrooms ?? '—'} bd · {listing.bathrooms ?? '—'} ba
                {listing.squareFootage ? ` · ${listing.squareFootage} sqft` : ''}
              </div>
              {listing.daysOnMarket != null && (
                <div className="text-muted" style={{ fontSize: 11 }}>{listing.daysOnMarket} days on market</div>
              )}
            </BlueprintCard>
          ))}
        </div>
      )}

      {data && !data.listings?.length && (
        <BlueprintCard><p className="card-body">No listings matched. Try widening the filters.</p></BlueprintCard>
      )}
    </>
  );
}
