import { create } from 'zustand';
import { User } from '../types';
import { API_BASE_URL } from '../utils/config';
import { IS_DESKTOP } from '../utils/config';
import { readBrowserSession, writeBrowserSession, persistNativeSession, readNativeSession } from '../utils/sessionStorage';

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  sessionReady: boolean;
  restoreSession: () => Promise<void>;

  setAuth: (token: string, user: User) => void;
  login: (username: string, password: string) => Promise<boolean>;
  register: (username: string, displayName: string, password: string, inviteCode: string) => Promise<boolean>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  updateStatus: (status: string, customActivity?: string) => Promise<void>;
  updateProfile: (data: { displayName?: string; avatarUrl?: string; customActivity?: string }) => Promise<boolean>;
  clearError: () => void;
}

const browserSession = readBrowserSession();
let authGeneration = 0;
let restoration: Promise<void> | undefined;

export const useAuthStore = create<AuthState>((set, get) => ({
  token: browserSession.token,
  user: browserSession.user,
  isAuthenticated: !!browserSession.token,
  sessionReady: !IS_DESKTOP,
  restoreSession: async () => {
    if (get().sessionReady) return;
    if (restoration) return restoration;
    const generation = authGeneration;
    restoration = (async () => {
      const stored = await readNativeSession();
      if (generation !== authGeneration) { set({ sessionReady: true }); return; }
      if (stored?.present) {
        const token = stored.session?.token ?? null;
        const user = stored.session?.user ?? null;
        writeBrowserSession(token, user);
        set({ token, user, isAuthenticated: !!token, sessionReady: true });
      } else {
        const { token, user } = get();
        if (token && user) await persistNativeSession({ token, user });
        set({ sessionReady: true });
      }
    })();
    try { await restoration; } finally { restoration = undefined; }
  },
  isLoading: false,
  error: null,

  setAuth: (token: string, user: User) => {
    authGeneration++;
    writeBrowserSession(token, user);
    set({ token, user, isAuthenticated: true, sessionReady: true, error: null });
  },

  login: async (username: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
        signal: AbortSignal.timeout(15000),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(typeof data.detail === 'string' ? data.detail : 'Проверьте логин и пароль');
      }

      const data = await response.json();
      get().setAuth(data.access_token, data.user);
      return true;
    } catch (err: any) {
      set({ error: err.name === 'TimeoutError' ? 'Сервер не ответил. Проверьте подключение и попробуйте снова.' : err.message, isLoading: false });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  register: async (username: string, displayName: string, password: string, inviteCode: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
        signal: AbortSignal.timeout(15000),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          display_name: displayName,
          password,
          invite_code: inviteCode,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(typeof data.detail === 'string' ? data.detail : 'Проверьте поля: пароль — от 8 символов, логин и имя не должны быть пустыми');
      }

      const data = await response.json();
      get().setAuth(data.access_token, data.user);
      return true;
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  logout: () => {
    authGeneration++;
    writeBrowserSession(null, null);
    set({ token: null, user: null, isAuthenticated: false, sessionReady: true, error: null });
  },

  fetchMe: async () => {
    const token = get().token;
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (get().token !== token) return;
      if (response.ok) {
        const user = await response.json();
        if (get().token !== token) return;
        writeBrowserSession(token, user);
        set({ user });
      } else if (response.status === 401 || response.status === 403) {
        get().logout();
      }
    } catch {
      // If server unreachable, keep local user session
    }
  },

  updateStatus: async (status: string, customActivity?: string) => {
    const token = get().token;
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/users/me/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status, custom_activity: customActivity }),
      });
      if (response.ok) {
        const updated = await response.json();
        if (get().token !== token) return;
        writeBrowserSession(token, updated);
        set({ user: updated });
      }
    } catch (err) {
      console.error('Failed to update status', err);
    }
  },

  updateProfile: async (data: { displayName?: string; avatarUrl?: string; customActivity?: string }) => {
    const token = get().token;
    if (!token) return false;

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/users/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          display_name: data.displayName,
          avatar_url: data.avatarUrl,
          custom_activity: data.customActivity,
        }),
      });

      if (response.ok) {
        const updated = await response.json();
        if (get().token !== token) return false;
        writeBrowserSession(token, updated);
        set({ user: updated });
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to update profile', err);
      return false;
    }
  },

  clearError: () => set({ error: null }),
}));

useAuthStore.subscribe((state, previous) => {
  if (state.token === previous.token && state.user === previous.user) return;
  if (state.token !== previous.token) authGeneration++;
  void persistNativeSession(state.token && state.user ? { token: state.token, user: state.user } : null);
});
