import { useState } from 'react';
import BlueprintCard from '../components/BlueprintCard.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useRecurringBills, useSaveRecurringBill, useDeleteRecurringBill } from '../api/hooks.js';
import { CATEGORIES } from '../constants/categories.js';
import { money } from '../utils/format.js';

const EMPTY_BILL = { description: '', category: 'Other', amount: '', dayOfMonth: '', type: 'bill' };

export default function RecurringBills() {
  const { data, isLoading } = useRecurringBills();
  const saveBill = useSaveRecurringBill();
  const deleteBill = useDeleteRecurringBill();
  const [draft, setDraft] = useState(EMPTY_BILL);

  const update = (key) => (e) => setDraft({ ...draft, [key]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    const signedAmount = draft.type === 'income' ? Math.abs(Number(draft.amount)) : -Math.abs(Number(draft.amount));
    saveBill.mutate(
      { ...draft, amount: signedAmount, dayOfMonth: Number(draft.dayOfMonth) },
      { onSuccess: () => setDraft(EMPTY_BILL) }
    );
  };

  const bills = data?.bills ?? [];
  const totalMonthlyIncome = bills.filter((b) => b.amount > 0).reduce((sum, b) => sum + b.amount, 0);
  const totalMonthlyBills = bills.filter((b) => b.amount < 0).reduce((sum, b) => sum + b.amount, 0);

  return (
    <>
      <PageHeader title="Recurring Bills" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
        <BlueprintCard style={{ gap: 'var(--space-2)' }}>
          <div className="card-kicker">Recurring Income (per occurrence)</div>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 26, color: 'var(--color-accent)' }}>
            {money(totalMonthlyIncome)}
          </div>
        </BlueprintCard>
        <BlueprintCard style={{ gap: 'var(--space-2)' }}>
          <div className="card-kicker">Recurring Bills (per occurrence)</div>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 26, color: 'var(--color-overspend)' }}>
            {money(totalMonthlyBills)}
          </div>
        </BlueprintCard>
      </div>

      <BlueprintCard>
        <div className="card-title">Add Recurring Bill or Income</div>
        <p className="card-body">
          This is the single source of truth for the cashflow calendar and for pre-filling Spending Plan allocations —
          add every regular paycheck and bill here instead of as one-off cashflow events.
        </p>
        <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-3)', alignItems: 'end' }}>
          <div className="field">
            <label htmlFor="description">Description</label>
            <input id="description" className="input" required value={draft.description} onChange={update('description')} placeholder="e.g. Spectrum internet" />
          </div>
          <div className="field">
            <label htmlFor="type">Type</label>
            <select id="type" className="input" value={draft.type} onChange={update('type')}>
              <option value="bill">Bill</option>
              <option value="income">Income</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="category">Category</label>
            <select id="category" className="input" value={draft.category} onChange={update('category')}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="amount">Amount</label>
            <input id="amount" className="input" type="number" step="0.01" min="0" required value={draft.amount} onChange={update('amount')} placeholder="80" />
          </div>
          <div className="field">
            <label htmlFor="dayOfMonth">Day of month</label>
            <input id="dayOfMonth" className="input" type="number" min="1" max="31" required value={draft.dayOfMonth} onChange={update('dayOfMonth')} placeholder="1-31" />
          </div>
          <button type="submit" className="btn btn-primary" disabled={saveBill.isPending}>
            {saveBill.isPending ? 'Saving…' : 'Add'}
          </button>
        </form>
      </BlueprintCard>

      <BlueprintCard>
        <div className="card-title">All Recurring Bills &amp; Income</div>
        {isLoading && <p className="card-body">Loading…</p>}
        {!isLoading && !bills.length && <p className="card-body">Nothing set up yet — add your first bill above.</p>}
        {bills.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Active</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => (
                  <tr key={bill.billId}>
                    <td>{bill.dayOfMonth}</td>
                    <td>{bill.description}</td>
                    <td><span className="tag tag-outline">{bill.category}</span></td>
                    <td style={{ color: bill.amount < 0 ? 'var(--color-overspend)' : 'var(--color-accent)' }}>
                      {money(bill.amount, { maximumFractionDigits: 2 })}
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={bill.isActive !== false}
                        onChange={(e) => saveBill.mutate({ billId: bill.billId, isActive: e.target.checked })}
                      />
                    </td>
                    <td>
                      <button type="button" className="btn btn-ghost" onClick={() => deleteBill.mutate(bill.billId)}>
                        Delete
                      </button>
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
