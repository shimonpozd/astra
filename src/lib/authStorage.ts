import { debugLog } from '../utils/debugLogger';

export interface StoredUser {
  id: string;
  username: string;
  role: string;
  is_active?: boolean;
}

const TOKEN_KEY = 'astra_access_token';
const USER_KEY = 'astra_auth_user';

let tokenCache: string | null | undefined = undefined;
let userCache: StoredUser | null | undefined = undefined;

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();

const isBrowser = typeof window !== 'undefined';

const readTokenFromStorage = () => {
  if (!isBrowser) return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch (error) {
    debugLog('[authStorage] Failed to read token from storage', error);
    return null;
  }
};

const readUserFromStorage = (): StoredUser | null => {
  if (!isBrowser) return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredUser;
  } catch (error) {
    debugLog('[authStorage] Failed to parse stored user', error);
    try {
      window.localStorage.removeItem(USER_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
};

export const authStorage = {
  getToken(): string | null {
    if (tokenCache === undefined) {
      tokenCache = readTokenFromStorage();
    }
    return tokenCache ?? null;
  },

  setToken(token: string | null) {
    if (!isBrowser) {
      tokenCache = token;
      return;
    }
    tokenCache = token;
    try {
      if (token) {
        window.localStorage.setItem(TOKEN_KEY, token);
      } else {
        window.localStorage.removeItem(TOKEN_KEY);
      }
    } catch (error) {
      debugLog('[authStorage] Failed to persist token', error);
    }
  },

  getUser(): StoredUser | null {
    if (userCache === undefined) {
      userCache = readUserFromStorage();
    }
    return userCache;
  },

  setUser(user: StoredUser | null) {
    userCache = user;
    if (!isBrowser) return;
    try {
      if (user) {
        window.localStorage.setItem(USER_KEY, JSON.stringify(user));
      } else {
        window.localStorage.removeItem(USER_KEY);
      }
    } catch (error) {
      debugLog('[authStorage] Failed to persist user', error);
    }
  },

  clear() {
    this.setToken(null);
    this.setUser(null);
  },

  onUnauthorized(listener: Listener) {
    unauthorizedListeners.add(listener);
    return () => unauthorizedListeners.delete(listener);
  },

  notifyUnauthorized() {
    unauthorizedListeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        debugLog('[authStorage] Unauthorized listener failed', error);
      }
    });
  },
};
