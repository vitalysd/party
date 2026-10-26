import { useEffect, useState } from 'react';
import { isPermissionGranted, requestPermission, sendNotification, onAction } from '@tauri-apps/plugin-notification';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { IS_DESKTOP } from '../../utils/config';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';
import { useVoiceStore } from '../../store/voiceStore';
import { useUIStore } from '../../store/uiStore';
import { Message } from '../../types';

const enabledKey = 'pati-desktop-notifications';
function enabled() { try { return localStorage.getItem(enabledKey) !== 'off'; } catch { return true; } }
let notificationId = 0;

export function DesktopNotifications() {
  const call = useVoiceStore(state => state.call);
  const userId = useAuthStore(state => state.user?.id);
  useEffect(() => {
    if (!IS_DESKTOP) return;
    let active = true;
    const targets = new Map<number, string>();
    let removeAction: (() => void) | undefined;
    onAction(async event => {
      if (!active) return;
      const channelId = event.notification ? targets.get(event.notification.id) : undefined;
      const window = getCurrentWindow();
      await window.show(); await window.unminimize(); await window.setFocus();
      if (channelId && useChatStore.getState().channels.some(channel => channel.id === channelId)) {
        useChatStore.getState().setActiveChannel(channelId);
        useUIStore.getState().setActiveTab('chats');
      }
    }).then(listener => { if (!active) void listener.unregister(); else removeAction = () => { void listener.unregister(); }; }).catch(() => {});
    async function notify(title: string, body: string, channelId: string) {
      const accountToken = useAuthStore.getState().token;
      if (!enabled() || await getCurrentWindow().isFocused() || !await isPermissionGranted()) return;
      if (!active || accountToken !== useAuthStore.getState().token) return;
      const id = ++notificationId;
      targets.set(id, channelId);
      if (targets.size > 100) targets.delete(targets.keys().next().value!);
      sendNotification({ id, title, body, sound: undefined, extra: { channelId } });
    }
    const message = (event: Event) => {
      const item = (event as CustomEvent<Message>).detail;
      if (item.sender_id === userId) return;
      void notify(item.sender?.display_name || 'Новое сообщение', item.content?.slice(0, 160) || 'Новое вложение', item.channel_id).catch(() => {});
    };
    const incoming = (event: Event) => {
      const item = (event as CustomEvent<{ name: string; channelId: string }>).detail;
      void notify('Входящий звонок', item.name, item.channelId).catch(() => {});
    };
    window.addEventListener('pati:new-message', message);
    window.addEventListener('pati:incoming-call', incoming);
    return () => { active = false; removeAction?.(); window.removeEventListener('pati:new-message', message); window.removeEventListener('pati:incoming-call', incoming); };
  }, [userId]);
  useEffect(() => {
    if (IS_DESKTOP && call?.status === 'ringing' && call.callee_id === userId) window.dispatchEvent(new CustomEvent('pati:incoming-call', { detail: { name: call.caller_name, channelId: call.channel_id } }));
  }, [call?.id, call?.status, userId]);
  return null;
}

export function DesktopNotificationSettings() {
  const [checked, setChecked] = useState(enabled);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  if (!IS_DESKTOP) return null;
  async function toggle() {
    setBusy(true); setNotice('');
    try {
      let next = !checked;
      if (next && !await isPermissionGranted()) next = await requestPermission() === 'granted';
      localStorage.setItem(enabledKey, next ? 'on' : 'off'); setChecked(next);
      if (!next && !checked) setNotice('Разрешите уведомления для пати в настройках Windows.');
    } catch { setNotice('Не удалось изменить разрешение на уведомления.'); }
    finally { setBusy(false); }
  }
  return <section className="rounded-xl border border-pati-border p-4 space-y-2">
    <label className="flex items-center gap-2 text-sm text-white"><input type="checkbox" checked={checked} disabled={busy} onChange={() => void toggle()} />Уведомления Windows</label>
    <p className="text-xs text-pati-text-muted">Сообщения и звонки, когда приложение свёрнуто. Закрытие окна оставляет пати в трее.</p>
    <button type="button" onClick={async () => { if (!await isPermissionGranted() && await requestPermission() !== 'granted') { setNotice('Разрешите уведомления в настройках Windows.'); return; } sendNotification({ title: 'пати', body: 'Уведомления включены' }); }} className="text-xs text-pati-accent-text">Проверить уведомление</button>
    {notice && <p role="status" className="text-xs text-pati-text-muted">{notice}</p>}
  </section>;
}
