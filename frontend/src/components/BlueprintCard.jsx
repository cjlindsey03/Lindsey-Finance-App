// The design system's signature frame: hairline border with corner registration marks.
export default function BlueprintCard({ children, elevated = true, style, className = '', ...rest }) {
  return (
    <div
      className={`blueprint ${elevated ? 'elev-sm' : ''} ${className}`.trim()}
      style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', ...style }}
      {...rest}
    >
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
      {children}
    </div>
  );
}
