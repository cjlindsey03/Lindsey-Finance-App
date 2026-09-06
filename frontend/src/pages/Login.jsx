import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import BlueprintCard from '../components/BlueprintCard.jsx';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 'var(--space-6)', background: 'var(--color-bg)' }}>
      <BlueprintCard style={{ width: 'min(360px, 100%)', gap: 'var(--space-4)' }}>
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
            <div className="card-title">Household Finance</div>
            <div className="text-muted" style={{ fontSize: 11 }}>lindsey-001</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {error && (
            <p role="alert" style={{ margin: 0, fontSize: 12, color: 'var(--color-overspend)' }}>
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-block">Sign in</button>
        </form>
      </BlueprintCard>
    </div>
  );
}
