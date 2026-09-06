import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Icon from './Icon.jsx';
import './AppShell.css';

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
      { to: '/recurring-bills', label: 'Recurring Bills', icon: 'calendar' },
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

function BrandMark({ size = 34 }) {
  return (
    <div
      className="blueprint"
      style={{
        width: size,
        height: size,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-heading)',
        fontWeight: 600,
        fontSize: size * 0.41,
        color: 'var(--color-accent)',
      }}
    >
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
      HF
    </div>
  );
}

function NavItem({ to, label, icon, end, onNavigate }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className="shell-nav-item"
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
  const [navOpen, setNavOpen] = useState(false);
  const { pathname } = useLocation();

  // Close the drawer on navigation and on Escape.
  useEffect(() => setNavOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="shell">
      <div className="shell-topbar">
        <button
          type="button"
          className="btn btn-secondary btn-icon"
          aria-label="Open navigation"
          aria-expanded={navOpen}
          onClick={() => setNavOpen(true)}
        >
          <Icon name="list" size={18} />
        </button>
        <BrandMark size={28} />
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 15 }}>
          Household Finance
        </div>
      </div>

      {navOpen && <div className="shell-backdrop" onClick={() => setNavOpen(false)} />}

      <div className="shell-sidebar" data-open={navOpen}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <BrandMark />
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
              <NavItem key={item.to} {...item} onNavigate={() => setNavOpen(false)} />
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

      <div className="shell-main hf-scroll">{children}</div>
    </div>
  );
}
