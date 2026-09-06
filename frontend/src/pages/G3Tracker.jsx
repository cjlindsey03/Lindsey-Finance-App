import { useState } from 'react';
import BlueprintCard from '../components/BlueprintCard.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useG3, useLogScore } from '../api/hooks.js';
import { money, percent } from '../utils/format.js';

const USERS = [
  { id: 'cj', label: 'CJ' },
  { id: 'victoria', label: 'Victoria' },
];

const EMPTY_FORM = {
  userId: 'cj',
  recordDate: new Date().toISOString().slice(0, 10),
  equifaxScore: '',
  transunionScore: '',
  experianScore: '',
  notes: '',
};

export default function G3Tracker() {
  const { data } = useG3();
  const logScore = useLogScore();
  const [form, setForm] = useState(EMPTY_FORM);

  const submit = (e) => {
    e.preventDefault();
    logScore.mutate(
      {
        ...form,
        equifaxScore: form.equifaxScore ? Number(form.equifaxScore) : null,
        transunionScore: form.transunionScore ? Number(form.transunionScore) : null,
        experianScore: form.experianScore ? Number(form.experianScore) : null,
      },
      { onSuccess: () => setForm({ ...EMPTY_FORM, userId: form.userId }) }
    );
  };

  return (
    <>
      <PageHeader title="G3 Credit" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
        {USERS.map((user) => {
          const latest = data?.latest?.[user.id];
          const history = data?.history?.[user.id] ?? [];
          return (
            <BlueprintCard key={user.id}>
              <div className="card-title">{user.label}</div>
              <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                {['equifax', 'transunion', 'experian'].map((bureau) => (
                  <div key={bureau}>
                    <div className="card-kicker">{bureau}</div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 22 }}>
                      {latest?.[`${bureau}Score`] ?? '—'}
                    </div>
                  </div>
                ))}
              </div>
              {latest?.nextTier && (
                <div className="text-muted" style={{ fontSize: 12 }}>
                  {latest.pointsAway} points to reach {latest.nextTier}
                </div>
              )}
              <div className="text-muted" style={{ fontSize: 11 }}>
                {history.length} score {history.length === 1 ? 'entry' : 'entries'} logged
              </div>
            </BlueprintCard>
          );
        })}
      </div>

      <BlueprintCard>
        <div className="card-title">Revolving Utilization</div>
        <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
          <div>
            <div className="card-kicker">Aggregate</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 26 }}>
              {percent(data?.utilization?.aggregateUtil, 1)}
            </div>
          </div>
          <div>
            <div className="card-kicker">To reach 30%</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 26 }}>
              {money(data?.utilizationTargets?.to30Pct)}
            </div>
          </div>
          <div>
            <div className="card-kicker">To reach 20%</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 26 }}>
              {money(data?.utilizationTargets?.to20Pct)}
            </div>
          </div>
        </div>

        {data?.utilization?.perCard?.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Card</th>
                  <th>Balance</th>
                  <th>Limit</th>
                  <th>Utilization</th>
                </tr>
              </thead>
              <tbody>
                {data.utilization.perCard.map((card) => (
                  <tr key={card.accountId}>
                    <td>{card.name}</td>
                    <td>{money(card.balance)}</td>
                    <td>{money(card.creditLimit)}</td>
                    <td style={{ color: card.utilization > 30 ? 'var(--color-overspend)' : 'inherit' }}>
                      {percent(card.utilization, 1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </BlueprintCard>

      <BlueprintCard>
        <div className="card-title">Log a Score</div>
        <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-3)', alignItems: 'end' }}>
          <div className="field">
            <label htmlFor="userId">User</label>
            <select id="userId" className="input" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
              {USERS.map((u) => (
                <option key={u.id} value={u.id}>{u.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="recordDate">Date</label>
            <input id="recordDate" className="input" type="date" value={form.recordDate} onChange={(e) => setForm({ ...form, recordDate: e.target.value })} />
          </div>
          {['equifax', 'transunion', 'experian'].map((bureau) => (
            <div className="field" key={bureau}>
              <label htmlFor={bureau}>{bureau[0].toUpperCase() + bureau.slice(1)}</label>
              <input
                id={bureau}
                className="input"
                type="number"
                value={form[`${bureau}Score`]}
                onChange={(e) => setForm({ ...form, [`${bureau}Score`]: e.target.value })}
              />
            </div>
          ))}
          <button type="submit" className="btn btn-primary" disabled={logScore.isPending}>
            {logScore.isPending ? 'Saving…' : 'Log Score'}
          </button>
        </form>
      </BlueprintCard>
    </>
  );
}
