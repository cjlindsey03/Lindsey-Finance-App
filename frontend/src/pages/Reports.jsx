import BlueprintCard from '../components/BlueprintCard.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useReports } from '../api/hooks.js';
import { money, shortDate } from '../utils/format.js';

export default function Reports() {
  const { data, isLoading, refetch, isFetching } = useReports();
  const reports = data?.reports ?? [];

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
        <div className="card-title">Pay Period Cash Flow Reports</div>
        <p className="card-body">
          A PDF is generated automatically on the last day of each pay period (the 14th and the end of the month), and
          both phones get a text when it's ready. View links are signed and expire after 15 minutes — hit Refresh if a
          link has gone stale.
        </p>

        {isLoading && <p className="card-body">Loading…</p>}
        {!isLoading && !reports.length && (
          <p className="card-body">
            No reports yet. The first one lands at the end of the current pay period.
          </p>
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
