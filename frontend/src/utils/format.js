export const money = (n, opts = {}) =>
  n == null
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
        ...opts,
      }).format(n);

export const percent = (n, digits = 0) => (n == null ? '—' : `${n.toFixed(digits)}%`);

export const shortDate = (iso) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
