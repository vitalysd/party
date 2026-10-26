import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { fetchPrivateFile, protectedFileUrl } from '../../utils/files';
import { acquireImage, cachedImageUrl } from '../../utils/imageCache';

export function useImageUrl(value?: string | null) {
  const token = useAuthStore(state => state.token);
  const [loaded, setLoaded] = useState<{ value: string; token: string; url: string } | null>(null);
  const endpoint = value ? protectedFileUrl(value) : null;
  useEffect(() => {
    if (!endpoint || !token || !value) return;
    let active = true;
    const image = acquireImage(endpoint, token);
    image.promise.then(url => {
      if (active) setLoaded({ value, token, url });
    }).catch(() => { /* Render the fallback for unavailable files. */ });
    return () => {
      active = false;
      image.release();
    };
  }, [endpoint, token, value]);
  if (!endpoint) return value && /^https?:\/\//.test(value) ? value : undefined;
  return (token && cachedImageUrl(endpoint, token)) || (loaded && loaded.value === value && loaded.token === token ? loaded.url : undefined);
}

export function ProtectedImage({ src, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  const url = useImageUrl(src);
  return url ? <img {...props} src={url} /> : <span className="text-xs text-pati-text-muted">Изображение недоступно или загружается</span>;
}

export function ProtectedFileLink({ href, filename, children, className }: {
  href: string; filename: string; children: React.ReactNode; className?: string;
}) {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const download = async () => {
    const token = useAuthStore.getState().token;
    if (!token || loading) return;
    setLoading(true);
    setError(false);
    try {
      const blob = await fetchPrivateFile(href, token);
      if (useAuthStore.getState().token !== token) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError(true); }
    finally { setLoading(false); }
  };
  if (!protectedFileUrl(href)) {
    return /^https?:\/\//.test(href)
      ? <a href={href} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>
      : <span>Файл недоступен</span>;
  }
  return <span>
    <button type="button" disabled={loading} onClick={download} className={className}>{children}</button>
    {error && <span role="alert" className="block text-xs text-pati-red-light">Не удалось скачать файл</span>}
  </span>;
}
