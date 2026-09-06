import { useEffect, useState } from 'react';
import BlueprintCard from '../components/BlueprintCard.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useSpendingPlans, useSpendingPlan, useSaveSpendingPlan, useRecurringBills } from '../api/hooks.js';
import { CATEGORIES } from '../constants/categories.js';
import { money, percent } from '../utils/format.js';
import { suggestAllocationsFromBills } from '../utils/billPeriod.js';

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);
  return mounted;
}

export default function SpendingPlans() {
  const mounted = useMounted();
  const { data: plansData } = useSpendingPlans();
  const [selectedPayDate, setSelectedPayDate] = useState('');
  const savePlan = useSaveSpendingPlan();

  const plans = plansData?.plans ?? [];
  const activePayDate = selectedPayDate || plans[0]?.payDate || '';
  const { data: planData } = useSpendingPlan(activePayDate);

  const plan = planData?.plan;
  const actuals = planData?.actuals ?? {};

  const categories = Object.entries(plan?.allocations ?? {}).map(([name, planned]) => ({
    name,
    planned,
    actual: actuals[name] ?? 0,
  }));

  const [draft, setDraft] = useState({ payDate: '', income: '', allocations: {} });
  const { data: billsData } = useRecurringBills();
  const [autoFilledCategories, setAutoFilledCategories] = useState([]);

  // Pre-fill fixed-cost categories (Housing, Debt_Payment, Childcare, etc.)
  // from whichever Recurring Bills land in this pay period. Only runs when
  // the pay date itself changes, so it never clobbers a manual edit made
  // afterward to some other field.
  useEffect(() => {
    if (!draft.payDate || !billsData?.bills) return;
    const suggested = suggestAllocationsFromBills(billsData.bills, draft.payDate);
    if (!Object.keys(suggested).length) return;
    setDraft((d) => ({
      ...d,
      allocations: {
        ...d.allocations,
        ...Object.fromEntries(Object.entries(suggested).map(([k, v]) => [k, String(v)])),
      },
    }));
    setAutoFilledCategories(Object.keys(suggested));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.payDate, billsData]);

  const submit = (e) => {
    e.preventDefault();
    savePlan.mutate(
      {
        payDate: draft.payDate,
        income: Number(draft.income) || 0,
        allocations: Object.fromEntries(
          Object.entries(draft.allocations)
            .filter(([, v]) => v !== '' && v != null)
            .map(([k, v]) => [k, Number(v)])
        ),
      },
      { onSuccess: (res) => setSelectedPayDate(res.plan.payDate) }
    );
  };

  return (
    <>
      <PageHeader
        title="Spending Plans"
        actions={
          plans.length > 0 && (
            <select className="input" value={activePayDate} onChange={(e) => setSelectedPayDate(e.target.value)}>
              {plans.map((p) => (
                <option key={p.payDate} value={p.payDate}>{p.label}</option>
              ))}
            </select>
          )
        }
      />

      {plan && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
            <BlueprintCard style={{ gap: 'var(--space-2)' }}>
              <div className="card-kicker">{plan.label} · Income</div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 28 }}>{money(plan.income)}</div>
            </BlueprintCard>

            <BlueprintCard style={{ gap: 'var(--space-2)' }}>
              <div className="card-kicker">Debt + Savings Rate</div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 28 }}>
                {percent(plan.scoreBreakdown?.combinedPct, 1)}
              </div>
            </BlueprintCard>

            <BlueprintCard
              elevated={false}
              style={{
                background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div className="card-kicker">Plan Score</div>
                <div className="text-muted" style={{ fontSize: 11 }}>
                  Combined {percent(plan.scoreBreakdown?.combinedPct, 1)}
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 34, color: 'var(--color-accent)' }}>
                {plan.score}
              </div>
            </BlueprintCard>
          </div>

          <BlueprintCard>
            <div className="card-title">Allocations vs Actuals</div>
            {categories.map((cat, i) => {
              const actualPct = cat.planned ? (cat.actual / cat.planned) * 100 : 0;
              const isOver = cat.actual > cat.planned;
              return (
                <div key={cat.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 120px) 1fr 90px', gap: 'var(--space-3)', alignItems: 'center' }}>
                  <div style={{ fontSize: 13 }}>{cat.name}</div>
                  <div style={{ position: 'relative', height: 14, background: 'var(--color-surface-2)' }}>
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: mounted ? `${Math.min(actualPct, 100)}%` : '0%',
                        background: isOver ? 'var(--color-overspend)' : 'color-mix(in srgb, var(--color-accent) 55%, transparent)',
                        transition: 'width 1s cubic-bezier(.2,.8,.2,1), background 300ms',
                        transitionDelay: `${i * 90}ms`,
                        border: '1px solid var(--color-bg)',
                      }}
                    />
                    <div style={{ position: 'absolute', top: 0, bottom: 0, width: 2, background: 'var(--color-text)', left: '100%' }} />
                  </div>
                  <div
                    className="text-muted"
                    style={{ fontSize: 12, fontWeight: 600, textAlign: 'right', color: isOver ? 'var(--color-overspend)' : 'inherit' }}
                  >
                    {isOver ? `+${money(cat.actual - cat.planned)} over` : `${money(cat.actual)} / ${money(cat.planned)}`}
                  </div>
                </div>
              );
            })}
            {!categories.length && <p className="card-body">This plan has no allocations yet.</p>}
          </BlueprintCard>
        </>
      )}

      <BlueprintCard>
        <div className="card-title">New Plan</div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-3)' }}>
            <div className="field">
              <label htmlFor="payDate">Pay date</label>
              <input id="payDate" className="input" type="date" required value={draft.payDate} onChange={(e) => setDraft({ ...draft, payDate: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="income">Expected net income</label>
              <input id="income" className="input" type="number" required value={draft.income} onChange={(e) => setDraft({ ...draft, income: e.target.value })} />
            </div>
          </div>

          <div>
            <div className="card-kicker">Allocations</div>
            {autoFilledCategories.length > 0 && (
              <div className="text-muted" style={{ fontSize: 11 }}>
                {autoFilledCategories.join(', ')} pre-filled from Recurring Bills for this pay period — override any of them below.
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-3)' }}>
            {CATEGORIES.filter((c) => c !== 'Income').map((category) => (
              <div className="field" key={category}>
                <label htmlFor={`alloc-${category}`}>
                  {category}
                  {autoFilledCategories.includes(category) && (
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

          <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={savePlan.isPending}>
            {savePlan.isPending ? 'Saving…' : 'Save Plan'}
          </button>
        </form>
      </BlueprintCard>
    </>
  );
}
