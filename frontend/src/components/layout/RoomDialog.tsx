import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Channel } from '../../types';
import { useModalFocus } from '../ui/useModalFocus';
import { ROOM_ICONS, RoomIcon } from '../ui/RoomIcon';
import { API_BASE_URL } from '../../utils/config';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';
import { useUIStore } from '../../store/uiStore';
import { useVoiceStore } from '../../store/voiceStore';

export function RoomDialog({ room, onClose }: { room?: Channel; onClose: () => void }) {
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;
    const previous = root.inert;
    root.inert = true;
    return () => { root.inert = previous; };
  }, []);
  const focusRef = useModalFocus();
  const [name, setName] = useState(room?.name ?? '');
  const [type, setType] = useState('text');
  const [icon, setIcon] = useState(room?.icon ?? 'coffee');
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    if (busy) return;
    setBusy(true); setError('');
    const token = useAuthStore.getState().token;
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/channels${room ? `/${room.id}` : ''}`, {
        method: deleting ? 'DELETE' : room ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: deleting ? undefined : JSON.stringify(room ? { icon } : { name: name.trim(), type, icon }),
      });
      if (!response.ok) throw new Error(response.status === 403 ? 'Недостаточно прав для изменения комнаты.' : 'Не удалось сохранить изменения. Попробуйте ещё раз.');
      if (useAuthStore.getState().token !== token) return;
      if (deleting && useVoiceStore.getState().currentChannelId === room?.id) useVoiceStore.getState().leaveVoice();
      await useChatStore.getState().loadChannels();
      if (!room) {
        const created: Channel = await response.json();
        useChatStore.getState().setActiveChannel(created.id);
        useUIStore.getState().setActiveTab('chats');
      }
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : 'Ошибка соединения'); }
    finally { setBusy(false); }
  }
  return createPortal(<div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onKeyDown={event => { if (event.key === 'Escape' && !busy) onClose(); }}>
    <div ref={focusRef} role="dialog" aria-modal="true" aria-labelledby="room-dialog-title" tabIndex={-1} className="w-full max-w-sm max-h-[90dvh] overflow-y-auto rounded-2xl border border-pati-border-strong bg-pati-panel p-5 text-white shadow-2xl">
      <div className="flex justify-between items-center mb-5"><h2 id="room-dialog-title" className="font-bold text-lg">{deleting ? 'Удалить комнату?' : room ? 'Настройки комнаты' : 'Новая комната'}</h2><button disabled={busy} aria-label="Закрыть" onClick={onClose}><X className="w-5 h-5" /></button></div>
      <form onSubmit={event => { event.preventDefault(); void save(); }} className="space-y-4">
        {deleting ? <p className="text-sm text-pati-text-secondary">Комната «{room?.name}» и её переписка будут удалены для всех участников. Это действие нельзя отменить.</p> : <>
          {room ? <p className="font-semibold break-words">{room.name}</p> : <>
            <label className="block text-sm">Название<input required maxLength={100} value={name} onChange={e => setName(e.target.value)} className="mt-2 w-full rounded-xl bg-pati-surface-elevated p-3 outline-none focus:ring-2 focus:ring-pati-accent" placeholder="Например, Чайхана" /></label>
            <label className="block text-sm">Тип комнаты<select value={type} onChange={e => setType(e.target.value)} className="mt-2 w-full rounded-xl bg-pati-surface-elevated p-3"><option value="text">Текстовая</option><option value="voice">Голосовая</option></select></label>
          </>}
          <fieldset><legend className="text-sm mb-2">Иконка комнаты</legend><div className="grid grid-cols-4 gap-2">{ROOM_ICONS.map(item => <button type="button" key={item.id} title={item.label} aria-label={item.label} aria-pressed={icon === item.id} onClick={() => setIcon(item.id)} className={`flex justify-center rounded-xl p-3 border ${icon === item.id ? 'bg-pati-accent border-pati-accent-light' : 'bg-pati-surface-elevated border-transparent hover:border-pati-accent-light'}`}><RoomIcon icon={item.id} className="w-5 h-5" /></button>)}</div></fieldset>
        </>}
        {error && <p role="alert" className="text-sm text-pati-red-light">{error}</p>}
        <div className="flex gap-2 pt-2"><button type="button" disabled={busy} onClick={() => deleting ? setDeleting(false) : onClose()} className="px-4 py-2 rounded-xl bg-pati-surface-elevated">Отмена</button><button disabled={busy || (!room && !name.trim())} className={`flex-1 rounded-xl px-4 py-2 font-semibold disabled:opacity-50 ${deleting ? 'bg-pati-red-hover' : 'bg-pati-accent'}`}>{busy ? 'Сохранение…' : deleting ? 'Удалить' : room ? 'Сохранить' : 'Создать комнату'}</button></div>
        {room && !deleting && <button type="button" disabled={busy} onClick={() => setDeleting(true)} className="text-sm text-pati-red-light hover:underline">Удалить комнату</button>}
      </form>
    </div>
  </div>, document.body);
}
