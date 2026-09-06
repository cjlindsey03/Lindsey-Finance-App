import { money, percent } from './format.js';

export function buildExportPrompt({ g1, g2, g3 }) {
  const g1Queue = (g1?.accounts ?? [])
    .map((a) => `${a.name} ${money(a.balance)} @ ${a.apr}%`)
    .join(' → ');

  const scores = Object.entries(g3?.latest ?? {})
    .map(([userId, record]) => `${userId}: best FICO ${record.bestScore || '—'}`)
    .join('\n');

  return `---HOUSEHOLD FINANCIAL SNAPSHOT (${new Date().toLocaleDateString()})---

GOAL 1 — REVOLVING DEBT (Snowball)
Total Remaining: ${money(g1?.totalBalance)}
Queue: ${g1Queue || '—'}
At ${money(g1?.monthlyExtra)}/mo extra: payoff in ${g1?.projection?.totalMonths ?? '—'} months (${g1?.projection?.projectedPayoffDate ?? '—'})
Total interest: ${money(g1?.projection?.totalInterest)}

GOAL 2 — PCS FUND
Target: ${money(g2?.targetAmount)} by ${g2?.pcsDate ?? '—'}
Current: ${money(g2?.currentAmount)}
Monthly contribution: ${money(g2?.monthlyContribution)}
On track: ${g2?.willReachByPCS ? 'YES' : 'NO'} (projected: ${g2?.projectedReachDate ?? '—'})

GOAL 3 — CREDIT
${scores || 'No scores logged yet'}
Aggregate utilization: ${percent(g3?.utilization?.aggregateUtil, 1)}
To reach 30%: pay down ${money(g3?.utilizationTargets?.to30Pct)}
To reach 20%: pay down ${money(g3?.utilizationTargets?.to20Pct)}

---YOUR QUESTION---
[Type your question here]`;
}
