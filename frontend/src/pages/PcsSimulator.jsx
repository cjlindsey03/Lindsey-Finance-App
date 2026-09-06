import { useEffect, useState } from 'react';
import BlueprintCard from '../components/BlueprintCard.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useRunPcsSimulation, usePcsSimulations } from '../api/hooks.js';
import { money } from '../utils/format.js';

const INITIAL_FORM = {
  truckType: '26ft',
  truckDailyRate: 40,
  truckMileageRate: 0.99,
  towEquipment: 'tow_dolly',
  towCost: 310,
  routeMiles: 2800,
  tripDays: 4,
  travelers: 2,
  hotelNights: 2,
  costPerNight: 140,
  estimatedHHGWeight: 8000,
  materialWeightLbs: 300,
  materialCost: 250,
  povMPG: 18,
  dlaAmount: 2366,
  gasPriceTier: 'mid',
};

const BREAKDOWN_ROWS = [
  { key: 'truckRentalCost', label: 'Truck rental' },
  { key: 'towCost', label: 'Tow equipment' },
  { key: 'fuelCost_truck', label: 'Fuel (truck)' },
  { key: 'fuelCost_pov', label: 'Fuel (POV)' },
  { key: 'hotelCost', label: 'Hotels' },
  { key: 'foodCost', label: 'Food (M&IE)' },
  { key: 'materialCost', label: 'Materials' },
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

  const toPayload = (extra = {}) => ({
    ...form,
    truckDailyRate: Number(form.truckDailyRate),
    truckMileageRate: Number(form.truckMileageRate),
    towCost: Number(form.towCost),
    routeMiles: Number(form.routeMiles),
    tripDays: Number(form.tripDays),
    travelers: Number(form.travelers),
    estimatedHHGWeight: Number(form.estimatedHHGWeight),
    materialWeightLbs: Number(form.materialWeightLbs),
    materialCost: Number(form.materialCost),
    povMPG: Number(form.povMPG),
    dlaAmount: Number(form.dlaAmount),
    hotelStops: [{ nights: Number(form.hotelNights), costPerNight: Number(form.costPerNight) }],
    ...extra,
  });

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const maxCost = results ? Math.max(...BREAKDOWN_ROWS.map((r) => results[r.key] ?? 0), 1) : 1;

  const numberFields = [
    ['routeMiles', 'Route miles'],
    ['tripDays', 'Trip days'],
    ['travelers', 'Travelers'],
    ['dlaAmount', 'DLA amount'],
    ['hotelNights', 'Hotel nights'],
    ['costPerNight', 'Cost per night (quoted)'],
    ['truckDailyRate', 'Truck daily rate'],
    ['truckMileageRate', 'Truck per-mile rate'],
    ['towCost', 'Tow equipment cost'],
    ['estimatedHHGWeight', 'HHG weight (lbs)'],
    ['materialWeightLbs', 'Material weight (lbs)'],
    ['materialCost', 'Material cost'],
  ];

  return (
    <>
      <PageHeader title="PCS Simulator" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--space-4)', alignItems: 'start' }}>
        <BlueprintCard>
          <div className="card-title">Run Inputs</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-3)' }}>
            <div className="field">
              <label htmlFor="truckType">Truck type</label>
              <select id="truckType" className="input" value={form.truckType} onChange={update('truckType')}>
                {['26ft', '20ft', '15ft', '10ft'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="towEquipment">Tow equipment</label>
              <select id="towEquipment" className="input" value={form.towEquipment} onChange={update('towEquipment')}>
                <option value="tow_dolly">Tow dolly</option>
                <option value="auto_transport">Auto transport</option>
                <option value="toy_hauler">Toy hauler</option>
              </select>
            </div>
            {numberFields.map(([key, labelText]) => (
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
              <input id="label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. 26ft + dolly" />
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
                ? `Net PPM profit ${money(results.netPPMProfit)} + DLA ${money(results.dlaAmount)}`
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
          </BlueprintCard>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-4)' }}>
            <BlueprintCard elevated={false} style={{ padding: 'var(--space-3)', gap: 'var(--space-1)' }}>
              <div className="card-kicker">Gov Constructive Cost</div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 20 }}>
                {results ? money(results.govConstructiveCost) : '—'}
              </div>
            </BlueprintCard>
            <BlueprintCard elevated={false} style={{ padding: 'var(--space-3)', gap: 'var(--space-1)' }}>
              <div className="card-kicker">Tax Reserve (22%)</div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 20 }}>
                {results ? money(results.taxReserve22Pct) : '—'}
              </div>
            </BlueprintCard>
          </div>

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
