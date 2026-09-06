import { NavLink } from 'react-router-dom';
import Icon from './Icon.jsx';

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: 'home', end: true },
      { to: '/cashflow', label: 'Cashflow', icon: 'calendar' },
      { to: '/transactions', label: 'Transactions', icon: 'list' },
    ],
  },
  {
    label: 'Goals',
    items: [
      { to: '/g1', label: 'G1 Debt', icon: 'target' },
      { to: '/g2', label: 'G2 PCS Fund', icon: 'wallet' },
      { to: '/g3', label: 'G3 Credit', icon: 'shield' },
    ],
  },
  {
    label: 'Planning',
    items: [
      { to: '/spending-plans', label: 'Spending Plans', icon: 'wallet' },
      { to: '/pcs-simulator', label: 'PCS Simulator', icon: 'truck' },
      { to: '/tasks', label: 'Tasks', icon: 'check' },
      { to: '/rentals', label: 'Rentals', icon: 'building' },
    ],
  },
  {
    label: 'Preferences',
    items: [{ to: '/settings', label: 'Settings', icon: 'settings' }],
  },
];

function NavItem({ to, label, icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: '7px var(--space-2)',
        borderLeft: `2px solid ${isActive ? 'var(--color-accent)' : 'transparent'}`,
        background: isActive ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'transparent',
        color: isActive ? 'var(--color-text)' : 'color-mix(in srgb, var(--color-text) 70%, transparent)',
        fontSize: 13,
        textDecoration: 'none',
      })}
    >
      <Icon name={icon} size={16} />
      {label}
    </NavLink>
  );
}

export default function AppShell({ children }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-body)' }}>
      <div
        style={{
          width: 238,
          flexShrink: 0,
          borderRight: '1px solid var(--color-divider)',
          padding: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-6)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div
            className="blueprint"
            style={{
              width: 34,
              height: 34,
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-heading)',
              fontWeight: 600,
              fontSize: 14,
              color: 'var(--color-accent)',
            }}
          >
            <i className="corner tl" />
            <i className="corner tr" />
            <i className="corner bl" />
            <i className="corner br" />
            HF
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 15, lineHeight: 1.1 }}>
              Household Finance
            </div>
            <div className="text-muted" style={{ fontSize: 11 }}>
              lindsey-001
            </div>
          </div>
        </div>

        {NAV_GROUPS.map((group) => (
          <div key={group.label} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <div
              style={{
                fontSize: 10,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                color: 'color-mix(in srgb, var(--color-text) 45%, transparent)',
                padding: '0 var(--space-2)',
              }}
            >
              {group.label}
            </div>
            {group.items.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
          </div>
        ))}

        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
            borderTop: '1px solid var(--color-divider)',
            paddingTop: 'var(--space-3)',
          }}
        >
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {[
              { initials: 'CJ', name: 'CJ' },
              { initials: 'V', name: 'Victoria' },
            ].map((person) => (
              <div key={person.name} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: 'color-mix(in srgb, var(--color-accent) 22%, transparent)',
                    color: 'var(--color-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 600,
                    fontSize: 10,
                  }}
                >
                  {person.initials}
                </span>
                {person.name}
              </div>
            ))}
          </div>
          <div className="text-muted" style={{ fontSize: 10 }}>
            Signed in as household
          </div>
        </div>
      </div>

      <div
        className="hf-scroll"
        style={{
          flex: 1,
          padding: 'var(--space-6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-6)',
          overflow: 'auto',
          maxHeight: '100vh',
        }}
      >
        {children}
      </div>
    </div>
  );
}
