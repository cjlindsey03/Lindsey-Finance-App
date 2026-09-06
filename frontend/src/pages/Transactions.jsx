import { useState } from 'react';
import { Link } from 'react-router-dom';
import BlueprintCard from '../components/BlueprintCard.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useTransactions, useCategorizeTransaction, useAccounts } from '../api/hooks.js';
import { CATEGORIES } from '../constants/categories.js';
import { money, shortDate } from '../utils/format.js';

export default function Transactions() {
  const [filters, setFilters] = useState({ startDate: '', endDate: '', accountId: '', category: '' });
  const { data, isLoading } = useTransactions(filters);
  const { data: accountsData } = useAccounts();
  const categorize = useCategorizeTransaction();

  const update = (key) => (e) => setFilters({ ...filters, [key]: e.target.value });

  return (
    <>
      <PageHeader
        title="Transactions"
        actions={<Link className="btn btn-secondary" to="/transactions/rules">Categorization Rules</Link>}
      />

      <BlueprintCard>
        <div className="card-title">Filters</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-3)' }}>
          <div className="field">
            <label htmlFor="startDate">From</label>
            <input id="startDate" className="input" type="date" value={filters.startDate} onChange={update('startDate')} />
          </div>
          <div className="field">
            <label htmlFor="endDate">To</label>
            <input id="endDate" className="input" type="date" value={filters.endDate} onChange={update('endDate')} />
          </div>
          <div className="field">
            <label htmlFor="accountId">Account</label>
            <select id="accountId" className="input" value={filters.accountId} onChange={update('accountId')}>
              <option value="">All accounts</option>
              {(accountsData?.accounts ?? []).map((a) => (
                <option key={a.accountId} value={a.accountId}>{a.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="category">Category</label>
            <select id="category" className="input" value={filters.category} onChange={update('category')}>
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </BlueprintCard>

      <BlueprintCard>
        <div className="card-title">
          {data?.transactions?.length ? `${data.transactions.length} transactions` : 'Transactions'}
        </div>
        {isLoading && <p className="card-body">Loading…</p>}
        {!isLoading && !data?.transactions?.length && (
          <p className="card-body">No transactions match these filters. Run a Plaid sync from Settings if this looks empty.</p>
        )}
        {data?.transactions?.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Merchant</th>
                  <th>Amount</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((tx) => (
                  <tr key={tx.transactionId}>
                    <td>{shortDate(tx.date)}</td>
                    <td>
                      {tx.merchantName}
                      {tx.pending && <span className="tag tag-outline" style={{ marginLeft: 6 }}>pending</span>}
                    </td>
                    <td style={{ color: tx.amount < 0 ? 'var(--color-accent)' : 'inherit' }}>{money(tx.amount, { maximumFractionDigits: 2 })}</td>
                    <td>
                      <select
                        className="input"
                        style={{ minHeight: 30, fontSize: 13 }}
                        value={tx.resolvedCategory ?? 'Other'}
                        onChange={(e) =>
                          categorize.mutate({ transactionId: tx.transactionId, category: e.target.value })
                        }
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
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
