import { Routes, Route, NavLink } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Cashflow from './pages/Cashflow.jsx';
import Transactions from './pages/Transactions.jsx';
import CategoryRules from './pages/CategoryRules.jsx';
import G1Tracker from './pages/G1Tracker.jsx';
import G2Tracker from './pages/G2Tracker.jsx';
import G3Tracker from './pages/G3Tracker.jsx';
import SpendingPlans from './pages/SpendingPlans.jsx';
import PcsSimulator from './pages/PcsSimulator.jsx';
import Tasks from './pages/Tasks.jsx';
import Rentals from './pages/Rentals.jsx';
import Settings from './pages/Settings.jsx';
import Login from './pages/Login.jsx';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/cashflow', label: 'Cashflow' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/g1', label: 'G1 Debt' },
  { to: '/g2', label: 'G2 PCS Fund' },
  { to: '/g3', label: 'G3 Credit' },
  { to: '/spending-plans', label: 'Spending Plans' },
  { to: '/pcs-simulator', label: 'PCS Simulator' },
  { to: '/tasks', label: 'Tasks' },
  { to: '/rentals', label: 'Rentals' },
  { to: '/settings', label: 'Settings' },
];

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <p>Loading…</p>;
  if (!user) return <Login />;

  return (
    <div>
      <nav>
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end}>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/cashflow" element={<Cashflow />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/transactions/rules" element={<CategoryRules />} />
          <Route path="/g1" element={<G1Tracker />} />
          <Route path="/g2" element={<G2Tracker />} />
          <Route path="/g3" element={<G3Tracker />} />
          <Route path="/spending-plans" element={<SpendingPlans />} />
          <Route path="/pcs-simulator" element={<PcsSimulator />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/rentals" element={<Rentals />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
