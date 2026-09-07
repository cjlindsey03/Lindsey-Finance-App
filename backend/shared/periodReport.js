const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { queryByPK, get } = require('./db');
const { billFallsInPeriod } = require('./payPeriod');

const RECURRING_BILLS_TABLE = process.env.RECURRING_BILLS_TABLE;
const CASHFLOW_EVENTS_TABLE = process.env.CASHFLOW_EVENTS_TABLE;
const SPENDING_PLANS_TABLE = process.env.SPENDING_PLANS_TABLE;
const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE;
const G2_TABLE = process.env.G2_TABLE;
const G3_TABLE = process.env.G3_TABLE;

const money = (n) =>
  (n < 0 ? '-' : '') + '$' + Math.abs(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const prettyDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// Everything the period-end report needs, gathered from the same tables the
// app's own pages read so the PDF can never disagree with the UI.
async function gatherPeriodData(householdId, period) {
  const [bills, events, plans, accounts, g2, g3Records] = await Promise.all([
    queryByPK(RECURRING_BILLS_TABLE, householdId),
    queryByPK(CASHFLOW_EVENTS_TABLE, householdId),
    queryByPK(SPENDING_PLANS_TABLE, householdId),
    queryByPK(ACCOUNTS_TABLE, householdId),
    get(G2_TABLE, { PK: householdId }),
    queryByPK(G3_TABLE, householdId),
  ]);

  const periodBills = bills
    .filter((b) => b.isActive !== false && billFallsInPeriod(b.dayOfMonth, period))
    .sort((a, b) => a.dayOfMonth - b.dayOfMonth);

  const periodEvents = events.filter(
    (e) => e.eventDate && e.eventDate >= period.periodStart && e.eventDate <= period.periodEnd
  );

  const lines = [
    ...periodBills.map((b) => ({
      day: b.dayOfMonth,
      description: b.description,
      category: b.category,
      amount: b.amount,
      recurring: true,
    })),
    ...periodEvents.map((e) => ({
      day: Number(e.eventDate.slice(-2)),
      description: e.description,
      category: e.type,
      amount: e.amount,
      recurring: false,
    })),
  ].sort((a, b) => a.day - b.day);

  const totalIncome = lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0);
  const totalBills = lines.filter((l) => l.amount < 0).reduce((s, l) => s + l.amount, 0);

  const committedPlan =
    plans.find(
      (p) => (p.status === 'committed' || p.status === 'applied') && p.periodKey === period.periodKey
    ) ?? null;

  const g1Accounts = accounts.filter((a) => a.isG1Target);
  const revolving = accounts.filter((a) => a.creditLimit > 0);
  const revolvingBalance = revolving.reduce((s, a) => s + (a.currentBalance ?? 0), 0);
  const revolvingLimit = revolving.reduce((s, a) => s + a.creditLimit, 0);

  const savings = g2?.savingsAccountId
    ? accounts.find((a) => a.SK === g2.savingsAccountId)
    : null;

  const latestScores = {};
  for (const record of [...g3Records].sort((a, b) => (a.SK ?? '').localeCompare(b.SK ?? ''))) {
    latestScores[record.userId] = Math.max(
      record.equifaxScore ?? 0,
      record.transunionScore ?? 0,
      record.experianScore ?? 0
    );
  }

  return {
    period,
    lines,
    totals: {
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalBills: Math.round(totalBills * 100) / 100,
      netFlow: Math.round((totalIncome + totalBills) * 100) / 100,
    },
    committedPlan,
    goals: {
      g1Total: Math.round(g1Accounts.reduce((s, a) => s + (a.currentBalance ?? 0), 0) * 100) / 100,
      g1Count: g1Accounts.length,
      g2Current: savings?.currentBalance ?? 0,
      g2Target: g2?.targetAmount ?? 0,
      g2PcsDate: g2?.pcsDate ?? null,
      utilization: revolvingLimit > 0 ? Math.round((revolvingBalance / revolvingLimit) * 1000) / 10 : null,
      revolvingBalance: Math.round(revolvingBalance * 100) / 100,
      revolvingLimit,
      latestScores,
    },
  };
}

// pdf-lib is used rather than pdfkit because it embeds the standard fonts
// directly and needs no filesystem access, so it survives esbuild bundling
// into a Lambda (pdfkit resolves its font metrics through package-internal
// subpath imports that bundlers can't follow).
async function renderPdf(data) {
  const { period, lines, totals, committedPlan, goals } = data;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const LEFT = 54;
  const RIGHT = 558;
  const INK = rgb(0, 0, 0);
  const MUTED = rgb(0.35, 0.35, 0.35);
  const ALERT = rgb(0.7, 0, 0);

  let y = 738;

  const text = (str, { size = 11, at = LEFT, color = INK, face = font } = {}) => {
    page.drawText(String(str), { x: at, y, size, font: face, color });
  };
  const line = (str, opts = {}) => {
    text(str, opts);
    y -= opts.gap ?? 15;
  };
  // Right-aligned amounts for the line-item table.
  const row = (label, amount, { size = 10 } = {}) => {
    page.drawText(label, { x: LEFT, y, size, font, color: INK });
    const w = font.widthOfTextAtSize(amount, size);
    page.drawText(amount, { x: RIGHT - w, y, size, font, color: INK });
    y -= 14;
  };
  const heading = (str) => {
    y -= 8;
    text(str, { size: 14, face: bold });
    y -= 6;
    page.drawLine({ start: { x: LEFT, y }, end: { x: RIGHT, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
    y -= 16;
  };

  line('Household Cash Flow Report', { size: 20, face: bold, gap: 20 });
  line(`Pay period ${prettyDate(period.periodStart)} - ${prettyDate(period.periodEnd)}`, { size: 11, color: MUTED });
  line(`Generated ${new Date().toLocaleString('en-US')}`, { size: 11, color: MUTED, gap: 10 });

  heading('Summary');
  line(`Income:  ${money(totals.totalIncome)}`);
  line(`Bills:   ${money(totals.totalBills)}`);
  line(`Net:     ${money(totals.netFlow)}`, { face: bold });
  if (totals.netFlow < 0) line('This period spent more than it brought in.', { color: ALERT });

  heading('Spending Plan');
  if (committedPlan) {
    const b = committedPlan.scoreBreakdown ?? {};
    line(`${committedPlan.label} - grade ${committedPlan.score}`);
    line(
      `${(b.debtContributionPct ?? 0).toFixed(1)}% to debt + ${(b.savingsContributionPct ?? 0).toFixed(1)}% to savings = ${(b.combinedPct ?? 0).toFixed(1)}% of income`,
      { size: 10 }
    );
    if (b.nextGrade) {
      line(`${money(b.amountToNextGrade)} more toward debt or savings would have earned a ${b.nextGrade}.`, { size: 10 });
    }
    const allocations = Object.entries(committedPlan.allocations ?? {}).sort((a, b2) => b2[1] - a[1]);
    if (allocations.length) {
      line('Allocations:', { size: 10, color: MUTED });
      for (const [category, amount] of allocations) row(`   ${category}`, money(amount));
    }
  } else {
    line('No plan was committed for this period.', { color: ALERT });
  }

  heading('Income & Bills This Period');
  if (!lines.length) {
    line('Nothing scheduled in this period.', { size: 10 });
  } else {
    for (const item of lines) row(`Day ${String(item.day).padStart(2, ' ')}  ${item.description}`, money(item.amount));
  }

  heading('Goals Snapshot');
  line(`G1 debt remaining: ${money(goals.g1Total)} across ${goals.g1Count} account(s)`);
  line(
    `G2 PCS fund: ${money(goals.g2Current)} of ${money(goals.g2Target)}${goals.g2PcsDate ? ` by ${prettyDate(goals.g2PcsDate)}` : ''}`
  );
  line(
    `G3 utilization: ${goals.utilization != null ? `${goals.utilization}%` : '-'} (${money(goals.revolvingBalance)} of ${money(goals.revolvingLimit)})`
  );
  for (const [user, score] of Object.entries(goals.latestScores)) {
    line(`   ${user} best FICO: ${score || '-'}`, { size: 10 });
  }

  return Buffer.from(await pdf.save());
}

async function buildPeriodReport(householdId, period) {
  const data = await gatherPeriodData(householdId, period);
  const pdf = await renderPdf(data);
  return { data, pdf };
}

module.exports = { buildPeriodReport, gatherPeriodData };
