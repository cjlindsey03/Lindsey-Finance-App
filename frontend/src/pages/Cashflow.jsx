import { useState } from 'react';
import BlueprintCard from '../components/BlueprintCard.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useCashflow, useCreateCashflowEvent, useDeleteCashflowEvent } from '../api/hooks.js';
import { money, shortDate } from '../utils/format.js';

const EMPTY_EVENT = { eventDate: '', description: '', amount: '', type: 'bill' };

export default function Cashflow() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [newEvent, setNewEvent] = useState(EMPTY_EVENT);

  const { data, isLoading } = useCashflow(year, month);
  const createEvent = useCreateCashflowEvent();
  const deleteEvent = useDeleteCashflowEvent();

  const step = (delta) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  const submit = (e) => {
    e.preventDefault();
    createEvent.mutate(
      { ...newEvent, amount: Number(newEvent.amount) },
      { onSuccess: () => setNewEvent(EMPTY_EVENT) }
    );
  };

  const monthLabel = new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <>
      <PageHeader
        title="Cashflow"
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => step(-1)}>←</button>
            <button type="button" className="btn btn-secondary" onClick={() => step(1)}>→</button>
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
        <BlueprintCard style={{ gap: 'var(--space-2)' }}>
          <div className="card-kicker">{monthLabel} · Income</div>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 26, color: 'var(--color-accent)' }}>
            {money(data?.totalIncome)}
          </div>
        </BlueprintCard>
        <BlueprintCard style={{ gap: 'var(--space-2)' }}>
          <div className="card-kicker">Bills</div>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 26, color: 'var(--color-overspend)' }}>
            {money(data?.totalBills)}
          </div>
        </BlueprintCard>
        <BlueprintCard style={{ gap: 'var(--space-2)' }}>
          <div className="card-kicker">Net for the month</div>
          <div
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 600,
              fontSize: 26,
              color: (data?.netFlow ?? 0) < 0 ? 'var(--color-overspend)' : 'inherit',
            }}
          >
            {money(data?.netFlow)}
          </div>
          <div className="text-muted" style={{ fontSize: 11 }}>
            Tightest: {shortDate(data?.lowestPointDate)} · {money(data?.lowestNetPosition)}
          </div>
        </BlueprintCard>
      </div>

      <BlueprintCard>
        <div className="card-title">Events — {monthLabel}</div>
        {isLoading && <p className="card-body">Loading…</p>}
        {!isLoading && !data?.events?.length && <p className="card-body">No events this month.</p>}
        {data?.events?.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Net so far</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.events.map((event) => (
                  <tr key={`${event.eventDate}-${event.eventId}`}>
                    <td>{shortDate(event.eventDate)}</td>
                    <td>{event.description}</td>
                    <td><span className="tag tag-outline">{event.type}</span></td>
                    <td style={{ color: event.amount < 0 ? 'var(--color-overspend)' : 'var(--color-accent)' }}>
                      {money(event.amount)}
                    </td>
                    <td className="text-muted">{money(data.dailyNetPosition[event.eventDate])}</td>
                    <td>
                      {event.source === 'manual' && (
                        <button type="button" className="btn btn-ghost" onClick={() => deleteEvent.mutate(event.eventId)}>
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </BlueprintCard>

      <BlueprintCard>
        <div className="card-title">Add Manual Event</div>
        <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-3)', alignItems: 'end' }}>
          <div className="field">
            <label htmlFor="eventDate">Date</label>
            <input id="eventDate" className="input" type="date" required value={newEvent.eventDate} onChange={(e) => setNewEvent({ ...newEvent, eventDate: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="description">Description</label>
            <input id="description" className="input" required value={newEvent.description} onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="amount">Amount (negative = outflow)</label>
            <input id="amount" className="input" type="number" step="0.01" required value={newEvent.amount} onChange={(e) => setNewEvent({ ...newEvent, amount: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="type">Type</label>
            <select id="type" className="input" value={newEvent.type} onChange={(e) => setNewEvent({ ...newEvent, type: e.target.value })}>
              <option value="income">Income</option>
              <option value="bill">Bill</option>
              <option value="credit_payment">Credit payment</option>
              <option value="loan_payment">Loan payment</option>
              <option value="other">Other</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary" disabled={createEvent.isPending}>
            {createEvent.isPending ? 'Adding…' : 'Add Event'}
          </button>
        </form>
      </BlueprintCard>
    </>
  );
}
