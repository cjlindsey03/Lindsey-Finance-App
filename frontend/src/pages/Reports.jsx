import { useState } from 'react';
import BlueprintCard from '../components/BlueprintCard.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useReports, useGenerateReport } from '../api/hooks.js';
import { money, shortDate } from '../utils/format.js';
import { getPeriod } from '../utils/billPeriod.js';

export default function Reports() {
  const { data, isLoading, refetch, isFetching } = useReports();
  const generate = useGenerateReport();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState(null);

  const reports = data?.reports ?? [];
  const targetPeriod = /^\d{4}-\d{2}-\d{2}$/.test(date) ? getPeriod(date) : null;

  const run = (e) => {
    e.preventDefault();
    setResult(null);
    generate.mutate(date, { onSuccess: (res) => setResult(res) });
  };

  return (
    <>
      <PageHeader
        title="Reports"
        actions={
          <button type="button" className="btn btn-secondary" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        }
      />

      <BlueprintCard>
        <div className="card-title">Generate a Report</div>
        <p className="card-body">
          Pick any date and you'll get a PDF for the pay period containing it — income vs. bills line by line, the
          committed plan's grade, and where the goals stand. Reports also generate on their own at the end of each pay
          period. Generating a period you already have replaces it with current numbers.
        </p>
        <form onSubmit={run} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'end', flexWrap: 'wrap' }}>
          <div className="field">
            <label htmlFor="reportDate">Date in the period</label>
            <input id="reportDate" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={generate.isPending}>
            {generate.isPending ? 'Generating…' : 'Generate report'}
          </button>
          {targetPeriod && (
            <div className="text-muted" style={{ fontSize: 11 }}>
              Covers {shortDate(targetPeriod.periodStart)} – {shortDate(targetPeriod.periodEnd)}
            </div>
          )}
        </form>
        {result && (
          <p style={{ fontSize: 12, color: 'var(--color-accent)' }}>
            {result.regenerated ? 'Regenerated' : 'Generated'} {shortDate(result.periodStart)} –{' '}
            {shortDate(result.periodEnd)}: net {money(result.totals?.netFlow)}. It's in the list below.
          </p>
        )}
        {generate.isError && (
          <p style={{ fontSize: 12, color: 'var(--color-overspend)' }}>{generate.error?.message}</p>
        )}
      </BlueprintCard>

      <BlueprintCard>
        <div className="card-title">Report History</div>
        <p className="card-body">
          View links are signed and expire after 15 minutes — hit Refresh if one has gone stale.
        </p>

        {isLoading && <p className="card-body">Loading…</p>}
        {!isLoading && !reports.length && (
          <p className="card-body">No reports yet — generate one above.</p>
        )}

        {reports.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Income</th>
                  <th>Bills</th>
                  <th>Net</th>
                  <th>Plan</th>
                  <th>Generated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.periodKey}>
                    <td>
                      {shortDate(r.periodStart)} – {shortDate(r.periodEnd)}
                    </td>
                    <td style={{ color: 'var(--color-accent)' }}>{money(r.totalIncome)}</td>
                    <td style={{ color: 'var(--color-overspend)' }}>{money(r.totalBills)}</td>
                    <td style={{ color: (r.netFlow ?? 0) < 0 ? 'var(--color-overspend)' : 'inherit', fontWeight: 600 }}>
                      {money(r.netFlow)}
                    </td>
                    <td>
                      {r.committedPlanScore ? (
                        <span className="tag tag-outline">{r.committedPlanScore}</span>
                      ) : (
                        <span className="text-muted">none</span>
                      )}
                    </td>
                    <td className="text-muted">
                      {r.generatedAt ? new Date(r.generatedAt).toLocaleDateString() : '—'}
                    </td>
                    <td>
                      <a className="btn btn-ghost" href={r.url} target="_blank" rel="noreferrer">
                        View PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </BlueprintCard>
    </>
  );
}
