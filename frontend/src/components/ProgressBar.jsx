// One bar, optionally in two parts: what you've actually done, and what a
// committed-but-not-yet-applied plan will add once its pay period starts.
// Actual progress never moves until the money does — the projected segment is
// deliberately lighter so the two are never confused.
export default function ProgressBar({ value, projected = 0, height = 10, animate = true }) {
  const actual = Math.max(0, Math.min(100, value ?? 0));
  const ahead = Math.max(0, Math.min(100 - actual, projected ?? 0));

  const fill = {
    height: '100%',
    transition: animate ? 'width 1s cubic-bezier(.2,.8,.2,1)' : undefined,
  };

  return (
    <div style={{ height, background: 'var(--color-surface-2)', display: 'flex', overflow: 'hidden' }}>
      <div style={{ ...fill, width: `${actual}%`, background: 'var(--color-accent)' }} />
      {ahead > 0 && (
        <div
          style={{
            ...fill,
            width: `${ahead}%`,
            background: 'color-mix(in srgb, var(--color-accent) 35%, transparent)',
          }}
        />
      )}
    </div>
  );
}
