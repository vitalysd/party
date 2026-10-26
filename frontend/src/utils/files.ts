import { API_BASE_URL } from './config';

export function protectedFileUrl(value: string): string | null {
  try {
    const base = new URL(API_BASE_URL);
    const url = new URL(value, base);
    if (url.origin !== base.origin || !/^\/(uploads|api\/v1\/files)\/[A-Za-z0-9_.-]+$/.test(url.pathname)) return null;
    // Never forward query credentials stored in old URLs.
    return `${base.origin}${url.pathname}`;
  } catch { return null; }
}

export async function fetchPrivateFile(url: string, token: string, signal?: AbortSignal) {
  const endpoint = protectedFileUrl(url);
  if (!endpoint) throw new Error('Некорректная ссылка на файл');
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` }, signal, redirect: 'error',
  });
  if (!response.ok) throw new Error('Файл недоступен');
  return response.blob();
}
