import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import BlueprintCard from '../components/BlueprintCard.jsx';
import PageHeader from '../components/PageHeader.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import { useG2, useUpdateG2, useAccounts } from '../api/hooks.js';
import { money } from '../utils/format.js';

export default function G2Tracker() {
  const { data } = useG2();
  const { data: accountsData } = useAccounts();
  const updateG2 = useUpdateG2();
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (data && !form) {
      setForm({
        targetAmount: data.targetAmount ?? 0,
        monthlyContribution: data.monthlyContribution ?? 0,
        pcsDate: data.pcsDate ?? '',
        savingsAccountId: data.savingsAccountId ?? '',
      });
    }
  }, [data, form]);

  const isPlanDriven = data?.monthlyContributionSource === 'plan';

  const progress = data?.targetAmount ? Math.min(100, (data.currentAmount / data.targetAmount) * 100) : 0;
  const projectedProgress = data?.targetAmount
    ? ((data.projectedDeposits ?? 0) / data.targetAmount) * 100
    : 0;
  const savingsAccounts = (accountsData?.accounts ?? []).filter(
    (a) => a.subtype === 'savings' || a.type === 'savings'
  );

  return (
    <>
      <PageHeader title="G2 PCS Fund" />

      <BlueprintCard>
        <div className="card-title">Progress</div>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 32 }}>
          {money(data?.currentAmount)} <span className="text-muted" style={{ fontSize: 18 }}>/ {money(data?.targetAmount)}</span>
        </div>
        <ProgressBar value={progress} projected={projectedProgress} />
        {data?.projectedDeposits > 0 && (
          <div className="text-muted" style={{ fontSize: 11 }}>
            {money(data.projectedDeposits)} scheduled from your committed plan, applying when the pay period starts.
          </div>
        )}
        <div className="text-muted" style={{ fontSize: 12 }}>
          {data?.projectedReachDate
            ? `Projected to hit target ${data.projectedReachDate}${
                data.willReachByPCS === false ? ' — after the PCS date' : data.willReachByPCS ? ' — before PCS' : ''
              }`
            : data?.willReachByPCS
            ? 'Target already reached'
            : 'Set a monthly contribution to see a projection'}
        </div>
      </BlueprintCard>

      {form && (
        <BlueprintCard>
          <div className="card-title">Settings</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)' }}>
            <div className="field">
              <label htmlFor="targetAmount">Target amount</label>
              <input
                id="targetAmount"
                className="input"
                type="number"
                value={form.targetAmount}
                onChange={(e) => setForm({ ...form, targetAmount: Number(e.target.value) || 0 })}
              />
            </div>
            <div className="field">
              <label htmlFor="monthlyContribution">Monthly contribution</label>
              {isPlanDriven ? (
                <>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 20, minHeight: 36, display: 'flex', alignItems: 'center' }}>
                    {money(data.monthlyContribution)}
                  </div>
                  <div className="text-muted" style={{ fontSize: 11 }}>
                    From the {data.activePlanPayDate} Spending Plan — <Link to="/spending-plans">edit it there</Link>
                  </div>
                </>
              ) : (
                <input
                  id="monthlyContribution"
                  className="input"
                  type="number"
                  value={form.monthlyContribution}
                  onChange={(e) => setForm({ ...form, monthlyContribution: Number(e.target.value) || 0 })}
                />
              )}
            </div>
            <div className="field">
              <label htmlFor="pcsDate">PCS date</label>
              <input
                id="pcsDate"
                className="input"
                type="date"
                value={form.pcsDate}
                onChange={(e) => setForm({ ...form, pcsDate: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="savingsAccountId">Linked savings account</label>
              <select
                id="savingsAccountId"
                className="input"
                value={form.savingsAccountId}
                onChange={(e) => setForm({ ...form, savingsAccountId: e.target.value })}
              >
                <option value="">— none —</option>
                {savingsAccounts.map((a) => (
                  <option key={a.accountId} value={a.accountId}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ alignSelf: 'flex-start' }}
            disabled={updateG2.isPending}
            onClick={() => {
              const { monthlyContribution, ...rest } = form;
              updateG2.mutate(isPlanDriven ? rest : form);
            }}
          >
            {updateG2.isPending ? 'Saving…' : 'Save'}
          </button>
        </BlueprintCard>
      )}
    </>
  );
}
