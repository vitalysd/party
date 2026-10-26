import { Message } from '../types';
const key = (userId: string) => `pati_outbox:${userId}`;

export function restoreOutbox(userId: string | undefined): Record<string, Message[]> {
  if (!userId) return {};
  try {
    const saved = JSON.parse(localStorage.getItem(key(userId)) || '[]');
    const result: Record<string, Message[]> = {};
    if (!Array.isArray(saved)) return result;
    for (const message of saved) {
      if (message?.sender_id !== userId || typeof message.channel_id !== 'string' ||
          typeof message.content !== 'string' || !message.client_request_id) continue;
      (result[message.channel_id] ||= []).push({ ...message, is_pending: false, is_failed: true });
    }
    return result;
  } catch { return {}; }
}

export function saveOutbox(userId: string | undefined, messages: Record<string, Message[]>) {
  if (!userId) return;
  try {
    localStorage.setItem(key(userId), JSON.stringify(Object.values(messages).flat()
      .filter(m => m.sender_id === userId && (m.is_failed || m.is_pending))));
  } catch { /* Keep in-memory retry available if browser storage is unavailable. */ }
}

export function clearOutbox(userId: string | undefined) {
  if (userId) { try { localStorage.removeItem(key(userId)); } catch { /* Storage disabled */ } }
}
