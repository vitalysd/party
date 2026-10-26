import { create } from 'zustand';
import { User } from '../types';
import { API_BASE_URL } from '../utils/config';

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  setAuth: (token: string, user: User) => void;
  login: (username: string, password: string) => Promise<boolean>;
  register: (username: string, displayName: string, password: string, inviteCode: string) => Promise<boolean>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  updateStatus: (status: string, customActivity?: string) => Promise<void>;
  updateProfile: (data: { displayName?: string; avatarUrl?: string; customActivity?: string }) => Promise<boolean>;
  clearError: () => void;
}

function readStoredUser(): User | null {
  try {
    const stored = localStorage.getItem('pati_user');
    return stored ? JSON.parse(stored) : null;
  } catch {
    localStorage.removeItem('pati_user');
    return null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem('pati_token'),
  user: readStoredUser(),
  isAuthenticated: !!localStorage.getItem('pati_token'),
  isLoading: false,
  error: null,

  setAuth: (token: string, user: User) => {
    localStorage.setItem('pati_token', token);
    localStorage.setItem('pati_user', JSON.stringify(user));
    set({ token, user, isAuthenticated: true, error: null });
  },

  login: async (username: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
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
      set({ error: err.message, isLoading: false });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  register: async (username: string, displayName: string, password: string, inviteCode: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
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
    localStorage.removeItem('pati_token');
    localStorage.removeItem('pati_user');
    set({ token: null, user: null, isAuthenticated: false, error: null });
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
        localStorage.setItem('pati_user', JSON.stringify(user));
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
        localStorage.setItem('pati_user', JSON.stringify(updated));
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
        localStorage.setItem('pati_user', JSON.stringify(updated));
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
