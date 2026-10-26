/** Per-listener preferences; never shared with other accounts or the server. */
export function readParticipantVolumes(userId?: string): Record<string, number> {
  if (!userId) return {};
  try {
    const value = JSON.parse(localStorage.getItem(`pati_volumes:${userId}`) ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, volume]) => typeof volume === 'number' && Number.isFinite(volume) && volume >= 0 && volume <= 1)) as Record<string, number>;
  } catch { return {}; }
}
export function saveParticipantVolumes(userId: string | undefined, volumes: Record<string, number>) {
  if (!userId) return;
  try { localStorage.setItem(`pati_volumes:${userId}`, JSON.stringify(volumes)); } catch { /* Keep in-memory controls available if storage is full or blocked. */ }
}
