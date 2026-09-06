import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getCurrentUser, fetchAuthSession, signIn, signOut } from 'aws-amplify/auth';

const AuthContext = createContext(null);

// `sam local` skips JWT verification and assumes the one household, so local
// dev signs in automatically rather than requiring a Cognito pool to exist.
const LOCAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'local';
const LOCAL_USER = { username: 'cj', idToken: null };

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
      const session = await fetchAuthSession();
      setUser({ username: current.username, idToken: session.tokens?.idToken?.toString() });
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const login = async (username, password) => {
    if (LOCAL_AUTH) return loadSession();
    await signIn({ username, password });
    await loadSession();
  };

  const logout = async () => {
    if (!LOCAL_AUTH) await signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
