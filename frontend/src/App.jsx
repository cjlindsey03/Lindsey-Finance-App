import { Routes, Route } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import AppShell from './components/AppShell.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Cashflow from './pages/Cashflow.jsx';
import RecurringBills from './pages/RecurringBills.jsx';
import G1Tracker from './pages/G1Tracker.jsx';
import G2Tracker from './pages/G2Tracker.jsx';
import G3Tracker from './pages/G3Tracker.jsx';
import SpendingPlans from './pages/SpendingPlans.jsx';
import PcsSimulator from './pages/PcsSimulator.jsx';
import Tasks from './pages/Tasks.jsx';
import Rentals from './pages/Rentals.jsx';
import Settings from './pages/Settings.jsx';
import Login from './pages/Login.jsx';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <p style={{ padding: 'var(--space-6)' }}>Loading…</p>;
  if (!user) return <Login />;

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/cashflow" element={<Cashflow />} />
        <Route path="/recurring-bills" element={<RecurringBills />} />
        <Route path="/g1" element={<G1Tracker />} />
        <Route path="/g2" element={<G2Tracker />} />
        <Route path="/g3" element={<G3Tracker />} />
        <Route path="/spending-plans" element={<SpendingPlans />} />
        <Route path="/pcs-simulator" element={<PcsSimulator />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/rentals" element={<Rentals />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </AppShell>
  );
}
