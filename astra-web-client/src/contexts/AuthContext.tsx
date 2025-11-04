import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';

import { authStorage, StoredUser } from '../lib/authStorage';
import { login as loginRequest } from '../services/auth';
import { debugLog } from '../utils/debugLogger';

interface AuthContextValue {
  user: StoredUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const initializeFromStorage = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem('astra_user_id');
      } catch {
        /* ignore legacy key cleanup */
      }
    }
    const storedToken = authStorage.getToken();
    const storedUser = authStorage.getUser();
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(storedUser);
    } else {
      authStorage.clear();
      setToken(null);
      setUser(null);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    initializeFromStorage();
    const unsubscribe = authStorage.onUnauthorized(() => {
      debugLog('[Auth] Unauthorized received, logging out');
      authStorage.clear();
      setToken(null);
      setUser(null);
    });
    return unsubscribe;
  }, [initializeFromStorage]);

  const login = useCallback(async (username: string, password: string) => {
    const response = await loginRequest(username, password);
    authStorage.setToken(response.access_token);
    authStorage.setUser(response.user);
    setToken(response.access_token);
    setUser(response.user);
  }, []);

  const logout = useCallback(() => {
    authStorage.clear();
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token),
      isLoading,
      login,
      logout,
    }),
    [user, token, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
