export default function PageHeader({ title, actions }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
      <div>
        <div className="text-muted" style={{ fontSize: 11 }}>
          Household / {title}
        </div>
        <h2 style={{ margin: '2px 0 0' }}>{title}</h2>
      </div>
      {actions && <div style={{ display: 'flex', gap: 'var(--space-2)' }}>{actions}</div>}
    </div>
  );
}
