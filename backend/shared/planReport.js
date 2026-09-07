const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const money = (n) =>
  (n < 0 ? '-' : '') + '$' + Math.abs(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const prettyDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// Grades color-code the same way the on-page ScoreCard's accent does: this
// just needs to read at a glance, not match exactly.
const GRADE_COLORS = {
  A: rgb(0.13, 0.5, 0.25),
  B: rgb(0.13, 0.5, 0.25),
  C: rgb(0.6, 0.5, 0.05),
  D: rgb(0.7, 0.3, 0),
  F: rgb(0.7, 0, 0),
};

// Same pdf-lib approach as periodReport.js — it embeds standard fonts
// directly with no filesystem access, so it survives esbuild's Lambda bundle.
async function renderPlanPdf(plan, accountNames = {}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const LEFT = 54;
  const RIGHT = 558;
  const INK = rgb(0, 0, 0);
  const MUTED = rgb(0.35, 0.35, 0.35);

  let y = 738;

  const text = (str, { size = 11, at = LEFT, color = INK, face = font } = {}) => {
    page.drawText(String(str), { x: at, y, size, font: face, color });
  };
  const line = (str, opts = {}) => {
    text(str, opts);
    y -= opts.gap ?? 15;
  };
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

  // Grade badge, top-right, drawn before the left-aligned flow starts so it
  // doesn't interact with the running `y` cursor.
  const grade = plan.score ?? '-';
  const badgeSize = 46;
  const badgeX = RIGHT - badgeSize;
  const badgeY = 720;
  page.drawRectangle({
    x: badgeX,
    y: badgeY,
    width: badgeSize,
    height: badgeSize,
    color: GRADE_COLORS[grade] ?? rgb(0.5, 0.5, 0.5),
  });
  const gradeFont = bold;
  const gradeSize = 28;
  const gradeW = gradeFont.widthOfTextAtSize(grade, gradeSize);
  page.drawText(grade, {
    x: badgeX + (badgeSize - gradeW) / 2,
    y: badgeY + 12,
    size: gradeSize,
    font: gradeFont,
    color: rgb(1, 1, 1),
  });

  line('Spending Plan', { size: 20, face: bold, gap: 20 });
  line(plan.label ?? 'Untitled plan', { size: 13, face: bold, gap: 16 });
  line(`Pay period ${prettyDate(plan.periodStart)} - ${prettyDate(plan.periodEnd)}`, { size: 11, color: MUTED });
  line(
    plan.status === 'committed'
      ? `Committed ${plan.committedAt ? new Date(plan.committedAt).toLocaleString('en-US') : ''}`
      : 'Draft — not yet committed',
    { size: 11, color: MUTED, gap: 10 }
  );

  const b = plan.scoreBreakdown ?? {};
  heading('Score');
  line(
    `${(b.debtContributionPct ?? 0).toFixed(1)}% to debt + ${(b.savingsContributionPct ?? 0).toFixed(1)}% to savings = ${(b.combinedPct ?? 0).toFixed(1)}% of income`
  );
  if (b.nextGrade) {
    line(`${money(b.amountToNextGrade)} more toward debt or savings would earn a ${b.nextGrade}.`, { size: 10, color: MUTED });
  }

  heading('Allocations');
  const income = Number(plan.income) || 0;
  const allocations = Object.entries(plan.allocations ?? {}).sort((a, c) => c[1] - a[1]);
  let allocated = 0;
  for (const [category, amount] of allocations) {
    row(category, money(amount));
    allocated += Number(amount) || 0;
  }
  if (plan.g1Extra) {
    row('Extra toward debt (G1)', money(plan.g1Extra));
    allocated += Number(plan.g1Extra) || 0;
  }
  if (plan.g2Allocation) {
    row('To savings (G2)', money(plan.g2Allocation));
    allocated += Number(plan.g2Allocation) || 0;
  }
  y -= 4;
  page.drawLine({ start: { x: LEFT, y }, end: { x: RIGHT, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  y -= 14;
  row('Expected income', money(income), { size: 11 });
  row('Unallocated', money(income - allocated), { size: 11 });

  if (plan.status === 'committed') {
    heading('Applied to Accounts');
    const payments = Object.entries(plan.accountPayments ?? {});
    if (!payments.length && !plan.savingsAmount) {
      line('No account payments were recorded.', { size: 10, color: MUTED });
    } else {
      for (const [accountId, amount] of payments) row(accountNames[accountId] ?? accountId, money(amount));
      if (plan.savingsAmount) row('To savings (G2)', money(plan.savingsAmount));
    }
  }

  return Buffer.from(await pdf.save());
}

module.exports = { renderPlanPdf };
