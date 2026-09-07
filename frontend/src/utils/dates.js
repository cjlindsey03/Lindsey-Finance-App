// Anything inside two weeks is close enough to need attention now.
export const URGENT_DAYS = 14;

const atMidnight = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Whole days from today until `iso` (YYYY-MM-DD). Negative once it's past.
// Compared at midnight so a date later today reads as 0 days, not a fraction.
export function daysUntil(iso) {
  if (!iso) return null;
  const target = atMidnight(`${iso}T00:00:00`);
  const now = atMidnight(new Date());
  return Math.round((target - now) / 86400000);
}

// PCS tasks store a relative offset ("30 days before the move"), so the real
// date only exists once you know the PCS date from the G2 tracker.
export function dueDateFromPcs(pcsDate, daysBeforePCS) {
  if (!pcsDate) return null;
  const due = new Date(`${pcsDate}T00:00:00`);
  due.setDate(due.getDate() - (Number(daysBeforePCS) || 0));
  return due.toISOString().slice(0, 10);
}

// How a countdown should read and colour: overdue, urgent (<= 14 days), or fine.
export function urgency(days) {
  if (days == null) return { label: null, tone: 'muted' };
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, tone: 'danger' };
  if (days === 0) return { label: 'Due today', tone: 'danger' };
  if (days <= URGENT_DAYS) return { label: `${days}d left`, tone: 'danger' };
  return { label: `${days}d left`, tone: 'muted' };
}
