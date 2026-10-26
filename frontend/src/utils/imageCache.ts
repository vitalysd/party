import { useAuthStore } from '../store/authStore';
import { fetchPrivateFile } from './files';

type Entry = { refs: number; bytes: number; url?: string; controller: AbortController; promise: Promise<string> };
const entries = new Map<string, Entry>();
let session: string | null = null;
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_ENTRIES = 128;

export function clearImageCache() {
  for (const entry of entries.values()) {
    entry.controller.abort();
    if (entry.url) URL.revokeObjectURL(entry.url);
  }
  entries.clear(); session = null;
}
function prune() {
  let bytes = [...entries.values()].reduce((sum, entry) => sum + entry.bytes, 0);
  for (const [key, entry] of entries) {
    if (bytes <= MAX_BYTES && entries.size <= MAX_ENTRIES) break;
    if (entry.refs) continue;
    entry.controller.abort();
    if (entry.url) URL.revokeObjectURL(entry.url);
    bytes -= entry.bytes; entries.delete(key);
  }
}
export function cachedImageUrl(endpoint: string, token: string) {
  return token === session ? entries.get(endpoint)?.url : undefined;
}
export function acquireImage(endpoint: string, token: string) {
  if (session !== token) { clearImageCache(); session = token; }
  let entry = entries.get(endpoint);
  if (!entry) {
    const controller = new AbortController();
    const created: Entry = { refs: 0, bytes: 0, controller, promise: Promise.resolve('') };
    created.promise = fetchPrivateFile(endpoint, token, controller.signal).then(blob => {
      if (controller.signal.aborted || entries.get(endpoint) !== created) throw new Error('Image cache cleared');
      created.bytes = blob.size;
      created.url = URL.createObjectURL(blob);
      prune();
      return created.url;
    }).catch(error => {
      if (entries.get(endpoint) === created) entries.delete(endpoint);
      throw error;
    });
    entry = created; entries.set(endpoint, entry);
  }
  entry.refs++;
  // Refresh insertion order for least-recently-used eviction.
  entries.delete(endpoint); entries.set(endpoint, entry);
  const acquired = entry;
  return { promise: entry.promise, release: () => { acquired.refs = Math.max(0, acquired.refs - 1); prune(); } };
}
useAuthStore.subscribe((state, previous) => {
  if (state.token !== previous.token) clearImageCache();
});
