import { useState } from 'react';
import { Phone } from 'lucide-react';
import { User } from '../../types';
import { useVoiceStore } from '../../store/voiceStore';
import { Avatar } from '../ui/Avatar';

const statusLabels = { online: 'В сети', idle: 'Отошёл', dnd: 'Не беспокоить', offline: 'Не в сети' };

export function DirectMessageHeader({ partner, channelId }: { partner: User; channelId: string }) {
  const [error, setError] = useState('');
  const currentChannelId = useVoiceStore(state => state.currentChannelId);
  const isConnected = useVoiceStore(state => state.isConnected);
  const isConnecting = useVoiceStore(state => state.isConnecting);
  const signallingCall = useVoiceStore(state => state.call);
  const activeCall = signallingCall?.channel_id === channelId || currentChannelId === channelId && (isConnected || isConnecting);
  async function call() {
    setError('');
    const connected = await useVoiceStore.getState().startCall(channelId);
    if (!connected && useVoiceStore.getState().error) setError(useVoiceStore.getState().error || 'Не удалось начать звонок.');
  }

  return <header className="shrink-0 border-b border-pati-border bg-pati-panel/80 px-4 py-3 sm:px-6">
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={partner.display_name} url={partner.avatar_url} size="md" status={partner.status} />
        <div className="min-w-0"><h2 className="truncate text-base font-bold text-white">{partner.display_name}</h2><p className={`truncate text-xs ${partner.status === 'online' ? 'text-pati-green-light' : 'text-pati-text-muted'}`}>{statusLabels[partner.status]}{partner.custom_activity ? ` · ${partner.custom_activity}` : ''}</p></div>
      </div>
      <button type="button" disabled={isConnecting || activeCall} onClick={() => void call()} className="flex shrink-0 items-center gap-2 rounded-xl border border-pati-border-strong bg-pati-surface-elevated px-3 py-2 text-xs font-semibold text-white transition hover:bg-pati-surface-hover disabled:opacity-50"><Phone size={14} className="text-pati-accent" />{signallingCall?.channel_id === channelId && signallingCall.status === 'ringing' ? 'Ожидаем ответа…' : activeCall ? (isConnecting ? 'Соединяемся…' : 'В звонке') : 'Позвонить'}</button>
    </div>
    {error && <p role="alert" className="mt-2 text-xs text-pati-red-text">{error}</p>}
  </header>;
}
