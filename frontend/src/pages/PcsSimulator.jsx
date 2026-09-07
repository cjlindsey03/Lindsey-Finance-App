import { useEffect, useState } from 'react';
import BlueprintCard from '../components/BlueprintCard.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useRunPcsSimulation, usePcsSimulations } from '../api/hooks.js';
import { money } from '../utils/format.js';

const INITIAL_FORM = {
  truckType: '26ft',
  // One quoted figure for the whole rental — that's how the rental companies
  // actually quote it, rather than separate daily and per-mile rates.
  quotedTruckRental: 1800,
  materialCost: 250,

  routeMiles: 2800,
  tripDays: 4,
  memberTravelDays: 4,
  dependentTravelDays: 4,
  povCount: 1,
  povMPG: 18,

  hotelNights: 2,
  costPerNight: 140,
  dailyFoodBudget: 120,

  estimatedHHGWeight: 8000,
  // Blank means "use the fitted estimate"; fill it in once TMO gives you the real one.
  actualGcc: '',

  gasPriceTier: 'mid',
};

const BREAKDOWN_ROWS = [
  { key: 'quotedTruckRental', label: 'Truck rental' },
  { key: 'fuelCost_truck', label: 'Fuel (truck)' },
  { key: 'fuelCost_pov', label: 'Fuel (POV)' },
  { key: 'hotelCost', label: 'Hotels' },
  { key: 'foodCost', label: 'Food' },
  { key: 'materialCost', label: 'Materials' },
];

const ENTITLEMENT_ROWS = [
  { key: 'dla', label: 'Dislocation allowance' },
  { key: 'malt', label: 'MALT (mileage)' },
  { key: 'memberPerDiem', label: 'Per diem — member' },
  { key: 'dependentPerDiem', label: 'Per diem — dependents' },
];

const NUMBER_FIELDS = [
  ['routeMiles', 'Route miles'],
  ['tripDays', 'Trip days'],
  ['quotedTruckRental', 'Quoted truck rental (whole trip)'],
  ['estimatedHHGWeight', 'HHG weight (lbs)'],
  ['memberTravelDays', 'Travel days — member'],
  ['dependentTravelDays', 'Travel days — dependents'],
  ['povCount', 'POVs driven'],
  ['povMPG', 'POV mpg'],
  ['hotelNights', 'Hotel nights'],
  ['costPerNight', 'Cost per night (quoted)'],
  ['dailyFoodBudget', 'Food per day'],
  ['materialCost', 'Material cost'],
];

export default function PcsSimulator() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [label, setLabel] = useState('');
  const [mounted, setMounted] = useState(false);
  const runSimulation = useRunPcsSimulation();
  const { data: savedRuns } = usePcsSimulations();

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const results = runSimulation.data?.results ?? runSimulation.data?.simulation?.results;

  const toPayload = (extra = {}) => {
    const numeric = Object.fromEntries(NUMBER_FIELDS.map(([key]) => [key, Number(form[key])]));
    return {
      truckType: form.truckType,
      gasPriceTier: form.gasPriceTier,
      ...numeric,
      // Only send an override when one was actually typed — an empty string
      // would otherwise coerce to 0 and wipe out the estimate.
      ...(form.actualGcc !== '' ? { actualGcc: Number(form.actualGcc) } : {}),
      hotelStops: [{ nights: Number(form.hotelNights), costPerNight: Number(form.costPerNight) }],
      ...extra,
    };
  };

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const maxCost = results ? Math.max(...BREAKDOWN_ROWS.map((r) => results[r.key] ?? 0), 1) : 1;

  return (
    <>
      <PageHeader title="PCS Simulator" />

      {/* min() rather than a bare 340px so the column can still shrink on a
          narrow phone instead of forcing the page to scroll sideways. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 'var(--space-4)', alignItems: 'start' }}>
        <BlueprintCard>
          <div className="card-title">Run Inputs</div>
          <p className="text-muted" style={{ fontSize: 11 }}>
            Entitlements (DLA, MALT, per diem) are calculated from your grade and travelling party — O-1 with
            dependents — so there's nothing to enter for them.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-3)' }}>
            <div className="field">
              <label htmlFor="truckType">Truck type</label>
              <select id="truckType" className="input" value={form.truckType} onChange={update('truckType')}>
                {['26ft', '20ft', '15ft', '10ft'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            {NUMBER_FIELDS.map(([key, labelText]) => (
              <div className="field" key={key}>
                <label htmlFor={key}>{labelText}</label>
                <input id={key} className="input" type="number" value={form[key]} onChange={update(key)} />
              </div>
            ))}
          </div>

          <div className="field">
            <label>Gas price tier</label>
            <div className="seg">
              {['low', 'mid', 'high'].map((tier) => (
                <label key={tier} className="seg-opt">
                  <input type="radio" name="gas" checked={form.gasPriceTier === tier} onChange={() => setForm({ ...form, gasPriceTier: tier })} />
                  {tier[0].toUpperCase() + tier.slice(1)}
                </label>
              ))}
            </div>
            <div className="text-muted" style={{ fontSize: 11 }}>
              Live weekly EIA prices — mid is the national average, low and high are the cheapest and priciest
              refining regions.
              {results?.gasPricePerGallon != null && (
                <> Using ${results.gasPricePerGallon.toFixed(2)}/gal ({results.gasPriceSource}
                {results.gasPriceAsOf ? `, ${results.gasPriceAsOf}` : ''}).</>
              )}
            </div>
          </div>

          <div className="field">
            <label htmlFor="actualGcc">Actual GCC from TMO (optional)</label>
            <input
              id="actualGcc"
              className="input"
              type="number"
              value={form.actualGcc}
              onChange={update('actualGcc')}
              placeholder="Leave blank to estimate"
            />
            <div className="text-muted" style={{ fontSize: 11 }}>
              The government's constructed cost sets your PPM payment. Until TMO gives you the real figure it's
              estimated from your weight and distance — expect roughly ±25%.
            </div>
          </div>

          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={runSimulation.isPending}
            onClick={() => runSimulation.mutate(toPayload())}
          >
            {runSimulation.isPending ? 'Calculating…' : 'Calculate'}
          </button>

          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="label">Save this run as</label>
              <input id="label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. 26ft, 8000 lbs" />
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!label || runSimulation.isPending}
              onClick={() => runSimulation.mutate(toPayload({ label }), { onSuccess: () => setLabel('') })}
            >
              Save
            </button>
          </div>
        </BlueprintCard>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <BlueprintCard elevated={false} style={{ background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)', gap: 4 }}>
            <div className="card-kicker">Total Net to Household</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 34, color: 'var(--color-accent)' }}>
              {results ? money(results.totalNetToHousehold) : '—'}
            </div>
            <div className="text-muted" style={{ fontSize: 11 }}>
              {results
                ? `Net PPM profit ${money(results.netPPMProfit)} + entitlements ${money(results.totalEntitlements)}`
                : 'Run a calculation to see results'}
            </div>
          </BlueprintCard>

          <BlueprintCard>
            <div className="card-title">Cost Breakdown</div>
            {BREAKDOWN_ROWS.map((row, i) => {
              const amount = results?.[row.key] ?? 0;
              return (
                <div key={row.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 110px) 1fr 70px', gap: 'var(--space-3)', alignItems: 'center' }}>
                  <div style={{ fontSize: 12 }}>{row.label}</div>
                  <div style={{ height: 10, background: 'var(--color-surface-2)' }}>
                    <div
                      style={{
                        height: '100%',
                        width: mounted && results ? `${(amount / maxCost) * 100}%` : '0%',
                        background: `color-mix(in srgb, var(--color-accent) ${45 + i * 8}%, transparent)`,
                        transition: 'width 1s cubic-bezier(.2,.8,.2,1)',
                        transitionDelay: `${i * 90}ms`,
                      }}
                    />
                  </div>
                  <div className="text-muted" style={{ fontSize: 12, textAlign: 'right' }}>
                    {results ? money(amount) : '—'}
                  </div>
                </div>
              );
            })}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--color-divider)', paddingTop: 'var(--space-2)', fontWeight: 600, fontSize: 13 }}>
              <span>Total out of pocket</span>
              <span>{results ? money(results.totalExpenses) : '—'}</span>
            </div>
          </BlueprintCard>

          <BlueprintCard>
            <div className="card-title">Entitlements</div>
            <p className="text-muted" style={{ fontSize: 11 }}>
              Paid on top of the PPM, regardless of how the move goes.
            </p>
            {ENTITLEMENT_ROWS.map((row) => (
              <div key={row.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span>{row.label}</span>
                <span>{results ? money(results[row.key]) : '—'}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--color-divider)', paddingTop: 'var(--space-2)', fontWeight: 600, fontSize: 13 }}>
              <span>Total entitlements</span>
              <span>{results ? money(results.totalEntitlements) : '—'}</span>
            </div>
          </BlueprintCard>

          <BlueprintCard>
            <div className="card-title">PPM Payment</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span>
                Gov constructed cost
                {results?.gccIsEstimate && <span className="text-muted"> (estimate)</span>}
              </span>
              <span>{results ? money(results.govConstructiveCost) : '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span>Less documented expenses</span>
              <span>{results ? `− ${money(results.totalExpenses)}` : '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span>Taxable profit</span>
              <span>{results ? money(results.taxableProfit) : '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span>Tax withheld (22%)</span>
              <span>{results ? `− ${money(results.taxWithheld)}` : '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--color-divider)', paddingTop: 'var(--space-2)', fontWeight: 600, fontSize: 13 }}>
              <span>Net PPM profit</span>
              <span>{results ? money(results.netPPMProfit) : '—'}</span>
            </div>
            {results && (
              <div className="text-muted" style={{ fontSize: 11 }}>
                Billable weight {results.billableWeight?.toLocaleString()} lbs of a{' '}
                {results.weightAllowance?.toLocaleString()} lb allowance.
                {results.weightOverAllowance > 0 && (
                  <> You're {results.weightOverAllowance.toLocaleString()} lbs over — the excess isn't paid.</>
                )}
              </div>
            )}
          </BlueprintCard>

          {savedRuns?.simulations?.length > 0 && (
            <BlueprintCard>
              <div className="card-title">Saved Runs</div>
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Label</th>
                      <th>Truck</th>
                      <th>Net to household</th>
                    </tr>
                  </thead>
                  <tbody>
                    {savedRuns.simulations.map((run) => (
                      <tr key={run.simulationId}>
                        <td>{run.label}</td>
                        <td>{run.truckType}</td>
                        <td>{money(run.results?.totalNetToHousehold)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </BlueprintCard>
          )}
        </div>
      </div>
    </>
  );
}
