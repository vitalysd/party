import { useAuthStore } from '../store/authStore';
import { API_BASE_URL, IS_DESKTOP, PUBLIC_APP_URL } from './config';

export async function copyInvite(): Promise<void> {
  const token = useAuthStore.getState().token;
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/invites`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ max_uses: 1 }),
  });
  if (!response.ok) throw new Error('Не удалось создать приглашение');
  const invite = await response.json();
  const url = new URL('/', IS_DESKTOP ? PUBLIC_APP_URL : location.origin);
  url.searchParams.set('invite', invite.code);
  await navigator.clipboard.writeText(url.toString());
}
