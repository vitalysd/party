import { Message } from '../types';

export function newRequestId(): string {
  // getRandomValues also works on the existing HTTP deployment.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function compareMessages(a: Message, b: Message) {
  const milliseconds = Date.parse(a.created_at) - Date.parse(b.created_at);
  if (milliseconds) return milliseconds;
  // PostgreSQL retains microseconds, while Date.parse retains only milliseconds.
  const fraction = (value: string) => (value.match(/\.(\d+)/)?.[1] || '').padEnd(9, '0');
  const precision = fraction(a.created_at).localeCompare(fraction(b.created_at));
  return precision || a.id.localeCompare(b.id);
}

export function mergeMessages(...groups: Message[][]): Message[] {
  const byId = new Map<string, Message>();
  for (const message of groups.flat()) byId.set(message.id, message);
  const confirmed = new Set([...byId.values()]
    .filter(m => !m.is_pending && !m.is_failed && m.client_request_id)
    .map(m => `${m.sender_id}:${m.client_request_id}`));
  return [...byId.values()].filter(m =>
    !(m.is_pending || m.is_failed) || !m.client_request_id ||
    !confirmed.has(`${m.sender_id}:${m.client_request_id}`)
  ).sort(compareMessages);
}
