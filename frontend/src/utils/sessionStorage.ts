import { invoke } from '@tauri-apps/api/core';
import { IS_DESKTOP } from './config';
import { User } from '../types';

export type SavedSession = { token: string; user: User };
type StoredSession = { present: boolean; session: SavedSession | null };
let pendingWrite: Promise<void> = Promise.resolve();

export function readBrowserSession(): { token: string | null; user: User | null } {
  try {
    const token = localStorage.getItem('pati_token');
    const raw = localStorage.getItem('pati_user');
    let user: User | null = null;
    try { user = raw ? JSON.parse(raw) : null; } catch { /* Native storage may recover the user. */ }
    return { token, user };
  } catch { return { token: null, user: null }; }
}

export function writeBrowserSession(token: string | null, user: User | null) {
  try {
    if (token) localStorage.setItem('pati_token', token); else localStorage.removeItem('pati_token');
    if (user) localStorage.setItem('pati_user', JSON.stringify(user)); else localStorage.removeItem('pati_user');
  } catch { /* Windows has a separate encrypted session store. */ }
}

export function persistNativeSession(session: SavedSession | null): Promise<void> {
  if (!IS_DESKTOP) return Promise.resolve();
  // Preserve ordering: logout must never be overwritten by an earlier save.
  pendingWrite = pendingWrite.then(() => invoke<void>('save_session', { session })).catch(() => {});
  return pendingWrite;
}

export async function readNativeSession(): Promise<StoredSession | undefined> {
  if (!IS_DESKTOP) return undefined;
  await pendingWrite;
  try {
    const stored = await invoke<StoredSession>('load_session');
    if (stored.session && (typeof stored.session.token !== 'string' || !stored.session.token || typeof stored.session.user?.id !== 'string')) return undefined;
    return stored;
  } catch { return undefined; }
}
