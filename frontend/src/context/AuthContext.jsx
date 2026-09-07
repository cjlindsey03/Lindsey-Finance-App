import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getCurrentUser, fetchAuthSession, signIn, signOut } from 'aws-amplify/auth';

const AuthContext = createContext(null);

// `sam local` skips JWT verification and assumes the one household, so local
// dev signs in automatically rather than requiring a Cognito pool to exist.
const LOCAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'local';
const LOCAL_USER = { username: 'cj' };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadSession = useCallback(async () => {
    if (LOCAL_AUTH) {
      setUser(LOCAL_USER);
      setLoading(false);
      return;
    }
    try {
      const current = await getCurrentUser();
      // Just proving a session exists — the token itself is fetched per
      // request, never cached here.
      await fetchAuthSession();
      setUser({ username: current.username });
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // Cognito ID tokens last an hour. Holding one in state meant that after an
  // hour every request carried an expired JWT, API Gateway rejected it, and
  // the Lambda never even ran — which looked like empty pages and dead
  // buttons rather than an expired login. Asking Amplify for the token on
  // each request lets it refresh silently off the 30-day refresh token.
  const getIdToken = useCallback(async () => {
    if (LOCAL_AUTH) return null;
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() ?? null;
  }, []);

  const login = async (username, password) => {
    if (LOCAL_AUTH) return loadSession();
    await signIn({ username, password });
    await loadSession();
  };

  const logout = async () => {
    if (!LOCAL_AUTH) await signOut();
    setUser(null);
  };

  // When a refresh finally fails (refresh token expired or revoked), drop the
  // user so the app shows the login screen instead of silently failing.
  const endSession = useCallback(() => setUser(null), []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, getIdToken, endSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
