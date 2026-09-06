import { useState } from 'react';
import { Link } from 'react-router-dom';
import BlueprintCard from '../components/BlueprintCard.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useG1 } from '../api/hooks.js';
import { money, percent } from '../utils/format.js';

export default function G1Tracker() {
  const [strategy, setStrategy] = useState('snowball');
  const { data, isLoading } = useG1(undefined, strategy);

  const payoffByAccount = Object.fromEntries(
    (data?.projection?.schedule ?? []).map((s) => [s.accountId, s.paidOffMonth])
  );

  return (
    <>
      <PageHeader title="G1 Debt" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
        <BlueprintCard style={{ gap: 'var(--space-2)' }}>
          <div className="card-kicker">Total Remaining</div>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 28 }}>
            {money(data?.totalBalance)}
          </div>
        </BlueprintCard>
        <BlueprintCard style={{ gap: 'var(--space-2)' }}>
          <div className="card-kicker">Months to Payoff</div>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 28 }}>
            {data?.projection?.totalMonths ?? '—'}
          </div>
          <div className="text-muted" style={{ fontSize: 11 }}>
            {data?.projection?.projectedPayoffDate ?? ''}
          </div>
        </BlueprintCard>
        <BlueprintCard style={{ gap: 'var(--space-2)' }}>
          <div className="card-kicker">Total Interest</div>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 28 }}>
            {money(data?.projection?.totalInterest)}
          </div>
        </BlueprintCard>
      </div>

      <BlueprintCard>
        <div className="card-title">Payoff Plan</div>
        <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field" style={{ maxWidth: 220 }}>
            <label>Monthly extra payment</label>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 22 }}>
              {money(data?.monthlyExtra)}
            </div>
            <div className="text-muted" style={{ fontSize: 11 }}>
              {data?.monthlyExtraSource === 'plan' ? (
                <>From the {data.activePlanPayDate} Spending Plan — <Link to="/spending-plans">edit it there</Link></>
              ) : (
                <>No Spending Plan yet — <Link to="/spending-plans">create one</Link> to set this</>
              )}
            </div>
          </div>
          <div className="field">
            <label>Strategy</label>
            <div className="seg">
              {['snowball', 'avalanche'].map((s) => (
                <label key={s} className="seg-opt">
                  <input type="radio" name="strategy" checked={strategy === s} onChange={() => setStrategy(s)} />
                  {s[0].toUpperCase() + s.slice(1)}
                </label>
              ))}
            </div>
          </div>
        </div>
      </BlueprintCard>

      <BlueprintCard>
        <div className="card-title">Accounts in Queue</div>
        {isLoading && <p className="card-body">Loading…</p>}
        {!isLoading && !data?.accounts?.length && (
          <p className="card-body">No accounts flagged as G1 targets yet — set that in Settings.</p>
        )}
        {data?.accounts?.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Balance</th>
                  <th>Limit</th>
                  <th>Utilization</th>
                  <th>APR</th>
                  <th>Paid off</th>
                </tr>
              </thead>
              <tbody>
                {data.accounts.map((acc) => (
                  <tr key={acc.accountId}>
                    <td>{acc.name}</td>
                    <td>{money(acc.balance)}</td>
                    <td>{acc.creditLimit ? money(acc.creditLimit) : '—'}</td>
                    <td>{percent(acc.utilization, 1)}</td>
                    <td>{acc.apr}%</td>
                    <td>{payoffByAccount[acc.accountId] ? `Month ${payoffByAccount[acc.accountId]}` : '—'}</td>
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
