import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getVersion } from '@tauri-apps/api/app';
import { check, Update } from '@tauri-apps/plugin-updater';
import { RefreshCw, X } from 'lucide-react';
import { IS_DESKTOP } from '../../utils/config';
import { useVoiceStore } from '../../store/voiceStore';
import { useModalFocus } from '../ui/useModalFocus';

function UpdateDialog({ onClose }: { onClose: () => void }) {
  const modalRef = useModalFocus();
  const update = useRef<Update | null>(null);
  const [version, setVersion] = useState('');
  const [available, setAvailable] = useState('');
  const [notes, setNotes] = useState('');
  const [phase, setPhase] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'installing' | 'current' | 'error'>('idle');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const inVoice = useVoiceStore(state => state.isConnected || state.isConnecting);
  const busy = ['checking', 'downloading', 'installing'].includes(phase);
  useEffect(() => {
    void getVersion().then(setVersion).catch(() => {});
    return () => { void update.current?.close(); };
  }, []);
  async function checkVersion() {
    setPhase('checking'); setError(''); setAvailable(''); setNotes('');
    try {
      await update.current?.close(); update.current = null;
      const found = await check({ timeout: 15000 });
      update.current = found;
      if (found) { setAvailable(found.version); setNotes(found.body || 'Улучшения приложения'); setPhase('available'); }
      else setPhase('current');
    } catch { setError('Не удалось проверить обновления. Проверьте подключение и повторите попытку.'); setPhase('error'); }
  }
  async function install() {
    if (!update.current) return;
    const voice = useVoiceStore.getState();
    if (voice.isConnected || voice.isConnecting) { setError('Сначала завершите голосовой разговор.'); return; }
    setError('');
    try {
      if (phase !== 'ready') {
        setPhase('downloading'); setProgress(null);
        let total = 0; let received = 0;
        await update.current.download(event => {
          if (event.event === 'Started') total = event.data.contentLength || 0;
          if (event.event === 'Progress') { received += event.data.chunkLength; if (total) setProgress(Math.min(100, Math.round(received / total * 100))); }
        });
      }
      const currentVoice = useVoiceStore.getState();
      if (currentVoice.isConnected || currentVoice.isConnecting) {
        setPhase('ready'); setError('Обновление загружено. Завершите разговор для установки.'); return;
      }
      setPhase('installing');
      await update.current.install({ restartAfterInstall: true });
    } catch { setError('Обновление не установлено. Не удалось скачать или проверить пакет. Повторите проверку.'); setPhase('error'); }
  }
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onKeyDown={event => { if (event.key === 'Escape' && !busy) onClose(); }}>
    <section ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="update-title" tabIndex={-1} className="w-full max-w-md rounded-2xl border border-pati-border bg-pati-panel p-6 shadow-2xl text-left">
      <div className="flex items-center justify-between gap-3"><h2 id="update-title" className="text-lg font-bold text-white">Обновления пати</h2><button type="button" aria-label="Закрыть обновления" disabled={busy} onClick={onClose} className="p-2 text-pati-text-muted disabled:opacity-40"><X size={18} /></button></div>
      <p className="mt-2 text-xs text-pati-text-muted">Установлена версия {version || '…'}</p>
      {available && <div className="mt-4 text-sm text-pati-text-secondary"><p className="font-semibold text-white">Доступна версия {available}</p><p className="mt-2 whitespace-pre-wrap break-words">{notes}</p></div>}
      <p role="status" className="mt-4 text-sm text-pati-text-secondary">{phase === 'checking' ? 'Проверяем обновления…' : phase === 'current' ? 'У вас последняя версия' : phase === 'downloading' ? `Загрузка обновления${progress === null ? '…' : `: ${progress}%`}` : phase === 'installing' ? 'Устанавливаем обновление. Приложение перезапустится…' : ''}</p>
      {inVoice && <p className="mt-3 text-xs text-pati-text-muted">Перед установкой завершите голосовой разговор.</p>}
      {error && <p role="alert" className="mt-3 text-sm text-pati-red-text">{error}</p>}
      {['available', 'ready'].includes(phase) ? <button type="button" disabled={inVoice} onClick={() => void install()} className="mt-5 w-full rounded-xl bg-pati-accent py-3 text-sm font-semibold text-white hover:bg-pati-accent-hover disabled:opacity-40">Обновить и перезапустить</button> : <button type="button" disabled={busy} onClick={() => void checkVersion()} className="mt-5 w-full rounded-xl bg-pati-accent py-3 text-sm font-semibold text-white hover:bg-pati-accent-hover disabled:opacity-40">Проверить обновления</button>}
    </section>
  </div>;
}

export function DesktopUpdateButton() {
  const [open, setOpen] = useState(false);
  if (!IS_DESKTOP) return null;
  return <><button type="button" onClick={() => setOpen(true)} aria-label="Обновления приложения" title="Обновления приложения" className="p-1.5 text-pati-text-muted hover:text-white hover:bg-pati-surface-elevated rounded-lg transition"><RefreshCw className="w-3.5 h-3.5" /></button>{open && createPortal(<UpdateDialog onClose={() => setOpen(false)} />, document.body)}</>;
}
