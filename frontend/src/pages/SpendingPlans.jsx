import { useEffect, useState } from 'react';
import BlueprintCard from '../components/BlueprintCard.jsx';
import PageHeader from '../components/PageHeader.jsx';
import {
  useSpendingPlans,
  useSaveSpendingPlan,
  useDeleteSpendingPlan,
  useCommitSpendingPlan,
  useUncommitSpendingPlan,
  usePlanPdf,
  useRecurringBills,
  useAccounts,
} from '../api/hooks.js';
import { CATEGORIES } from '../constants/categories.js';
import { money, percent, shortDate } from '../utils/format.js';
import { nextPeriod, suggestAllocationsFromBills, suggestIncomeFromBills } from '../utils/billPeriod.js';

const EMPTY_DRAFT = { label: '', income: '', allocations: {}, g1Extra: '', g2Allocation: '' };

// Debts are what a commit pays down; deposit accounts aren't listed.
const isDebtAccount = (a) => ['credit', 'loan', 'bnpl'].includes(a.type);

function ScoreCard({ plan }) {
  const b = plan.scoreBreakdown ?? {};
  return (
    <BlueprintCard
      elevated={false}
      style={{ background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)', gap: 'var(--space-2)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="card-kicker">Plan Score</div>
          <div className="text-muted" style={{ fontSize: 11 }}>
            {percent(b.debtContributionPct, 1)} debt + {percent(b.savingsContributionPct, 1)} savings ={' '}
            {percent(b.combinedPct, 1)}
          </div>
        </div>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 40, color: 'var(--color-accent)' }}>
          {plan.score}
        </div>
      </div>
      {b.nextGrade && (
        <div className="text-muted" style={{ fontSize: 12 }}>
          {money(b.amountToNextGrade)} more toward debt or savings would earn a {b.nextGrade}.
        </div>
      )}
    </BlueprintCard>
  );
}

export default function SpendingPlans() {
  const { data, isLoading } = useSpendingPlans();
  const { data: billsData } = useRecurringBills();
  const { data: accountsData } = useAccounts();
  const savePlan = useSaveSpendingPlan();
  const deletePlan = useDeleteSpendingPlan();
  const commitPlan = useCommitSpendingPlan();
  const uncommitPlan = useUncommitSpendingPlan();
  const planPdf = usePlanPdf();

  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState(null);
  const [autoFilled, setAutoFilled] = useState([]);
  const [committing, setCommitting] = useState(null);
  const [payments, setPayments] = useState({});
  const [savingsAmount, setSavingsAmount] = useState('');
  const [commitResult, setCommitResult] = useState(null);
  const [uncommitTarget, setUncommitTarget] = useState(null);

  const viewPdf = (planId) => {
    planPdf.mutate(planId, { onSuccess: (res) => window.open(res.url, '_blank', 'noopener') });
  };

  const period = data?.planningPeriod ?? nextPeriod();
  const drafts = data?.drafts ?? [];
  const committed = data?.committed ?? [];
  const committedThisPeriod = committed.find((p) => p.periodKey === period.periodKey);
  const debts = (accountsData?.accounts ?? []).filter(isDebtAccount);

  // Seed a new draft from the recurring bills that land in this pay period.
  useEffect(() => {
    if (editingId || !billsData?.bills) return;
    const suggested = suggestAllocationsFromBills(billsData.bills, period);
    if (!Object.keys(suggested).length) return;
    setDraft((d) => ({
      ...d,
      income: d.income || String(suggestIncomeFromBills(billsData.bills, period)),
      allocations: { ...Object.fromEntries(Object.entries(suggested).map(([k, v]) => [k, String(v)])), ...d.allocations },
    }));
    setAutoFilled(Object.keys(suggested));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billsData, period.periodKey, editingId]);

  const submitDraft = (e) => {
    e.preventDefault();
    savePlan.mutate(
      {
        planId: editingId ?? undefined,
        label: draft.label || undefined,
        periodStart: period.periodStart,
        income: Number(draft.income) || 0,
        g1Extra: Number(draft.g1Extra) || 0,
        g2Allocation: Number(draft.g2Allocation) || 0,
        allocations: Object.fromEntries(
          Object.entries(draft.allocations)
            .filter(([, v]) => v !== '' && v != null)
            .map(([k, v]) => [k, Number(v)])
        ),
      },
      {
        onSuccess: () => {
          setDraft(EMPTY_DRAFT);
          setEditingId(null);
          setAutoFilled([]);
        },
      }
    );
  };

  const startEditing = (plan) => {
    setEditingId(plan.planId);
    setAutoFilled([]);
    setDraft({
      label: plan.label ?? '',
      income: String(plan.income ?? ''),
      g1Extra: String(plan.g1Extra ?? ''),
      g2Allocation: String(plan.g2Allocation ?? ''),
      allocations: Object.fromEntries(Object.entries(plan.allocations ?? {}).map(([k, v]) => [k, String(v)])),
    });
  };

  const startCommitting = (plan) => {
    setCommitResult(null);
    setCommitting(plan);
    setPayments(
      Object.fromEntries(debts.map((a) => [a.accountId, a.minimumPayment != null ? String(a.minimumPayment) : '']))
    );
    setSavingsAmount(String(plan.g2Allocation ?? ''));
  };

  const paymentsTotal = Object.values(payments).reduce((sum, v) => sum + (Number(v) || 0), 0);
  const plannedDebt = Number(committing?.allocations?.Debt_Payment ?? 0);

  const submitUncommit = () => {
    uncommitPlan.mutate(uncommitTarget.planId, {
      onSuccess: (res) => {
        setCommitResult(res.changes ?? []);
        setUncommitTarget(null);
      },
    });
  };

  const submitCommit = () => {
    commitPlan.mutate(
      {
        planId: committing.planId,
        accountPayments: Object.fromEntries(
          Object.entries(payments).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)])
        ),
        savingsAmount: Number(savingsAmount) || 0,
      },
      {
        onSuccess: (res) => {
          setCommitResult(res.changes ?? []);
          setCommitting(null);
        },
      }
    );
  };

  return (
    <>
      <PageHeader title="Spending Plans" />

      <BlueprintCard style={{ gap: 'var(--space-2)' }}>
        <div className="card-kicker">Planning for next pay period</div>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 22 }}>
          {shortDate(period.periodStart)} – {shortDate(period.periodEnd)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {committedThisPeriod
              ? `Committed: ${committedThisPeriod.label} (${committedThisPeriod.score})`
              : `${drafts.length} draft${drafts.length === 1 ? '' : 's'} — none committed yet. Build one before the check lands; drafts clear once the period passes.`}
          </div>
          {committedThisPeriod && (
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button type="button" className="btn btn-ghost" onClick={() => viewPdf(committedThisPeriod.planId)} disabled={planPdf.isPending}>
                View PDF
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setUncommitTarget(committedThisPeriod)}>
                Uncommit
              </button>
            </div>
          )}
        </div>
      </BlueprintCard>

      {uncommitTarget && (
        <BlueprintCard>
          <div className="card-title">Uncommit “{uncommitTarget.label}”?</div>
          <p className="card-body">
            This reverses the balance changes this plan applied — payments go back onto their accounts, savings
            comes back out — and turns it back into an editable draft. You can then commit a different plan for
            this period instead.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" onClick={submitUncommit} disabled={uncommitPlan.isPending}>
              {uncommitPlan.isPending ? 'Reversing…' : 'Uncommit and reverse balances'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setUncommitTarget(null)}>Cancel</button>
          </div>
          {uncommitPlan.isError && (
            <p style={{ fontSize: 12, color: 'var(--color-overspend)' }}>{uncommitPlan.error?.message}</p>
          )}
        </BlueprintCard>
      )}

      {commitResult && (
        <BlueprintCard>
          <div className="card-title">Balances updated</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr><th>Account</th><th>Applied</th><th>Before</th><th>After</th></tr>
              </thead>
              <tbody>
                {commitResult.map((c) => (
                  <tr key={c.accountId}>
                    <td>{c.name}</td>
                    <td style={{ color: c.payment < 0 ? 'var(--color-accent)' : 'inherit' }}>
                      {c.payment < 0 ? `+${money(-c.payment)} saved` : money(c.payment)}
                    </td>
                    <td className="text-muted">{money(c.before, { maximumFractionDigits: 2 })}</td>
                    <td>{money(c.after, { maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </BlueprintCard>
      )}

      {committing && (
        <BlueprintCard>
          <div className="card-title">Commit “{committing.label}”</div>
          <p className="card-body">
            Enter what you're actually paying each account this period. Committing subtracts these from your balances,
            which is what updates G1, G3 and the dashboard.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
            {debts.map((account) => (
              <div className="field" key={account.accountId}>
                <label htmlFor={`pay-${account.accountId}`}>
                  {account.name}
                  <span className="text-muted" style={{ fontSize: 10 }}> · {money(account.currentBalance, { maximumFractionDigits: 2 })}</span>
                </label>
                <input
                  id={`pay-${account.accountId}`}
                  className="input"
                  type="number"
                  step="0.01"
                  min="0"
                  value={payments[account.accountId] ?? ''}
                  onChange={(e) => setPayments({ ...payments, [account.accountId]: e.target.value })}
                />
              </div>
            ))}
            <div className="field">
              <label htmlFor="savingsAmount">To savings (G2)</label>
              <input
                id="savingsAmount"
                className="input"
                type="number"
                step="0.01"
                min="0"
                value={savingsAmount}
                onChange={(e) => setSavingsAmount(e.target.value)}
              />
            </div>
          </div>
          <div className="text-muted" style={{ fontSize: 12 }}>
            Payments total {money(paymentsTotal)} against a planned Debt_Payment allocation of {money(plannedDebt)}
            {Math.abs(paymentsTotal - plannedDebt) > 0.5 && ' — these differ, which is fine if intentional.'}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" onClick={submitCommit} disabled={commitPlan.isPending}>
              {commitPlan.isPending ? 'Committing…' : 'Commit and apply balances'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setCommitting(null)}>Cancel</button>
          </div>
          {commitPlan.isError && (
            <p style={{ fontSize: 12, color: 'var(--color-overspend)' }}>{commitPlan.error?.message}</p>
          )}
        </BlueprintCard>
      )}

      <BlueprintCard>
        <div className="card-title">Drafts for this period</div>
        {isLoading && <p className="card-body">Loading…</p>}
        {!isLoading && !drafts.length && (
          <p className="card-body">No drafts yet — build one below to see it scored before you commit.</p>
        )}
        {drafts.map((plan) => (
          <div
            key={plan.planId}
            style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 'var(--space-3)', alignItems: 'center', borderTop: '1px solid var(--color-divider)', paddingTop: 'var(--space-3)' }}
          >
            <div>
              <div style={{ fontSize: 14 }}>
                {plan.label} <span className="tag tag-outline" style={{ marginLeft: 6 }}>{plan.score}</span>
              </div>
              <div className="text-muted" style={{ fontSize: 11 }}>
                {money(plan.income)} income · {percent(plan.scoreBreakdown?.combinedPct, 1)} to debt + savings
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-ghost" onClick={() => viewPdf(plan.planId)} disabled={planPdf.isPending}>View PDF</button>
              <button type="button" className="btn btn-ghost" onClick={() => startEditing(plan)}>Edit</button>
              <button type="button" className="btn btn-ghost" onClick={() => deletePlan.mutate(plan.planId)}>Delete</button>
              {!committedThisPeriod && (
                <button type="button" className="btn btn-secondary" onClick={() => startCommitting(plan)}>Commit</button>
              )}
            </div>
          </div>
        ))}
      </BlueprintCard>

      {drafts.length > 0 && <ScoreCard plan={drafts[0]} />}

      <BlueprintCard>
        <div className="card-title">{editingId ? 'Edit draft' : 'New draft'}</div>
        <form onSubmit={submitDraft} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-3)' }}>
            <div className="field">
              <label htmlFor="label">Name</label>
              <input id="label" className="input" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="e.g. Aggressive payoff" />
            </div>
            <div className="field">
              <label htmlFor="income">Expected net income</label>
              <input id="income" className="input" type="number" required value={draft.income} onChange={(e) => setDraft({ ...draft, income: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="g1Extra">Extra toward debt (G1)</label>
              <input id="g1Extra" className="input" type="number" value={draft.g1Extra} onChange={(e) => setDraft({ ...draft, g1Extra: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="g2Allocation">To savings (G2)</label>
              <input id="g2Allocation" className="input" type="number" value={draft.g2Allocation} onChange={(e) => setDraft({ ...draft, g2Allocation: e.target.value })} />
            </div>
          </div>

          <div>
            <div className="card-kicker">Allocations</div>
            {autoFilled.length > 0 && (
              <div className="text-muted" style={{ fontSize: 11 }}>
                {autoFilled.join(', ')} pre-filled from Recurring Bills for this period — override any of them below.
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-3)' }}>
            {CATEGORIES.filter((c) => c !== 'Income').map((category) => (
              <div className="field" key={category}>
                <label htmlFor={`alloc-${category}`}>
                  {category}
                  {autoFilled.includes(category) && (
                    <span className="tag tag-outline" style={{ marginLeft: 6, fontSize: 9 }}>bills</span>
                  )}
                </label>
                <input
                  id={`alloc-${category}`}
                  className="input"
                  type="number"
                  value={draft.allocations[category] ?? ''}
                  onChange={(e) => setDraft({ ...draft, allocations: { ...draft.allocations, [category]: e.target.value } })}
                />
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button type="submit" className="btn btn-primary" disabled={savePlan.isPending}>
              {savePlan.isPending ? 'Saving…' : editingId ? 'Save draft' : 'Score this draft'}
            </button>
            {editingId && (
              <button type="button" className="btn btn-secondary" onClick={() => { setEditingId(null); setDraft(EMPTY_DRAFT); }}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </BlueprintCard>

      {committed.length > 0 && (
        <BlueprintCard>
          <div className="card-title">Committed history</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr><th>Period</th><th>Plan</th><th>Income</th><th>Score</th><th>Committed</th><th /></tr>
              </thead>
              <tbody>
                {committed.map((plan) => (
                  <tr key={plan.planId}>
                    <td>{shortDate(plan.periodStart)}</td>
                    <td>{plan.label}</td>
                    <td>{money(plan.income)}</td>
                    <td><span className="tag tag-outline">{plan.score}</span></td>
                    <td className="text-muted">{plan.committedAt ? new Date(plan.committedAt).toLocaleDateString() : '—'}</td>
                    <td style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      <button type="button" className="btn btn-ghost" onClick={() => viewPdf(plan.planId)} disabled={planPdf.isPending}>
                        View PDF
                      </button>
                      {plan.periodKey === period.periodKey && (
                        <button type="button" className="btn btn-ghost" onClick={() => setUncommitTarget(plan)}>
                          Uncommit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </BlueprintCard>
      )}
    </>
  );
}
