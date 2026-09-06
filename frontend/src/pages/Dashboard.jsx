import { useEffect, useState } from 'react';
import BlueprintCard from '../components/BlueprintCard.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Icon from '../components/Icon.jsx';
import { useG1, useG2, useG3, useCashflow } from '../api/hooks.js';
import { money, percent, shortDate } from '../utils/format.js';

const today = new Date();

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);
  return mounted;
}

// The next seven days of the running balance, drawn as bars scaled to the
// largest value in the window.
function useCashflowWindow() {
  const { data } = useCashflow(today.getFullYear(), today.getMonth() + 1);
  if (!data) return null;

  const upcoming = Object.entries(data.dailyRunningBalance)
    .filter(([date]) => date >= today.toISOString().slice(0, 10))
    .slice(0, 7);

  const max = Math.max(...upcoming.map(([, balance]) => Math.abs(balance)), 1);

  return {
    lowestPointDate: data.lowestPointDate,
    lowestPointBalance: data.lowestPointBalance,
    bars: upcoming.map(([date, balance]) => ({
      day: new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' }),
      balance,
      pct: Math.max(4, (Math.abs(balance) / max) * 100),
    })),
  };
}

export default function Dashboard() {
  const mounted = useMounted();
  const g1 = useG1();
  const g2 = useG2();
  const g3 = useG3();
  const cashflow = useCashflowWindow();

  const summaryCards = [
    {
      kicker: 'G1 Remaining',
      value: money(g1.data?.totalBalance),
      trendLabel: g1.data ? `${g1.data.projection.totalMonths} months to payoff` : 'Loading…',
      trendColor: 'var(--color-accent)',
      trendIcon: 'down',
    },
    {
      kicker: 'G2 PCS Fund',
      value: g2.data ? `${money(g2.data.currentAmount)} / ${money(g2.data.targetAmount)}` : '—',
      trendLabel:
        g2.data?.targetAmount > 0
          ? `${Math.round((g2.data.currentAmount / g2.data.targetAmount) * 100)}% to target`
          : 'No target set',
      trendColor: 'var(--color-accent)',
      trendIcon: 'up',
    },
    {
      kicker: 'Household Utilization',
      value: percent(g3.data?.utilization?.aggregateUtil, 1),
      trendLabel: g3.data
        ? `${money(g3.data.utilizationTargets.to30Pct)} to reach 30%`
        : 'Loading…',
      trendColor: g3.data?.utilization?.aggregateUtil > 30 ? '#d99a6c' : 'var(--color-accent)',
      trendIcon: 'up',
    },
    {
      kicker: 'Victoria FICO',
      value: g3.data?.latest?.victoria?.bestScore || '—',
      trendLabel: g3.data?.latest?.victoria
        ? `${g3.data.latest.victoria.pointsAway} pts to ${g3.data.latest.victoria.nextTier ?? 'top tier'}`
        : 'No score logged',
      trendColor: 'var(--color-accent)',
      trendIcon: 'up',
    },
  ];

  const g3Users = Object.entries(g3.data?.latest ?? {}).map(([userId, record]) => ({
    name: userId === 'cj' ? 'CJ' : userId === 'victoria' ? 'Victoria' : userId,
    fico: record.bestScore,
    utilization: g3.data?.utilization?.aggregateUtil ?? 0,
  }));

  return (
    <>
      <PageHeader title="Dashboard" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
          {summaryCards.map((card) => (
            <BlueprintCard key={card.kicker} style={{ gap: 6 }}>
              <div className="card-kicker">{card.kicker}</div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 26 }}>{card.value}</div>
              <div style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, color: card.trendColor }}>
                <Icon name={card.trendIcon} size={12} />
                {card.trendLabel}
              </div>
            </BlueprintCard>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-4)', alignItems: 'start' }}>
          <BlueprintCard style={{ gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <div className="card-title">Cashflow — Next 7 Days</div>
              <div className="text-muted" style={{ fontSize: 11 }}>
                {cashflow
                  ? `Lowest: ${shortDate(cashflow.lowestPointDate)} · ${money(cashflow.lowestPointBalance)}`
                  : 'Loading…'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-3)', height: 140, padding: '0 var(--space-2)' }}>
              {(cashflow?.bars ?? []).map((bar, i) => (
                <div key={`${bar.day}-${i}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'color-mix(in srgb, var(--color-text) 55%, transparent)' }}>
                    {money(bar.balance)}
                  </div>
                  <div
                    style={{
                      width: '100%',
                      maxWidth: 26,
                      background:
                        bar.balance < 0
                          ? 'var(--color-overspend)'
                          : `color-mix(in srgb, var(--color-accent) ${45 + bar.pct * 0.4}%, transparent)`,
                      height: mounted ? `${bar.pct}%` : '4%',
                      transition: 'height 900ms cubic-bezier(.2,.8,.2,1)',
                      transitionDelay: `${i * 80}ms`,
                    }}
                  />
                  <div className="text-muted" style={{ fontSize: 10 }}>{bar.day}</div>
                </div>
              ))}
            </div>
          </BlueprintCard>

          <BlueprintCard>
            <div className="card-title">G1 Snowball Queue</div>
            {(g1.data?.accounts ?? []).map((acc, i) => (
              <div key={acc.accountId} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, gap: 'var(--space-2)' }}>
                  <span>{acc.name}</span>
                  <span className="text-muted" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {money(acc.balance)}
                    {acc.creditLimit ? ` / ${money(acc.creditLimit)}` : ''} · {acc.apr}% APR
                  </span>
                </div>
                <div style={{ height: 5, background: 'var(--color-surface-2)' }}>
                  <div
                    style={{
                      height: '100%',
                      background: 'var(--color-accent)',
                      width: mounted && acc.utilization != null ? `${100 - acc.utilization}%` : '0%',
                      transition: 'width 1s cubic-bezier(.2,.8,.2,1)',
                      transitionDelay: `${i * 100}ms`,
                    }}
                  />
                </div>
              </div>
            ))}
            {!g1.data?.accounts?.length && (
              <p className="card-body">No G1 accounts flagged yet — mark accounts as snowball targets in Settings.</p>
            )}
          </BlueprintCard>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
          {g3Users.map((u) => {
            const radius = 40;
            const circumference = 2 * Math.PI * radius;
            return (
              <BlueprintCard key={u.name} style={{ flexDirection: 'row', gap: 'var(--space-4)', alignItems: 'center' }}>
                <svg viewBox="0 0 100 100" style={{ width: 88, height: 88, flex: 'none', transform: 'rotate(-90deg)' }}>
                  <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--color-surface-2)" strokeWidth="8" />
                  <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="none"
                    stroke="var(--color-accent)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={mounted ? circumference * (1 - u.utilization / 100) : circumference}
                    style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1)' }}
                  />
                </svg>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div className="card-kicker">{u.name} · Utilization</div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 24 }}>{percent(u.utilization, 1)}</div>
                  <div className="text-muted" style={{ fontSize: 11 }}>FICO 8: {u.fico || '—'}</div>
                </div>
              </BlueprintCard>
            );
          })}
        </div>
      </div>
    </>
  );
}
