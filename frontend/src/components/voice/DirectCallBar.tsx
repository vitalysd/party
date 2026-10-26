import { Mic, MicOff, PhoneOff } from 'lucide-react';
import { useVoiceStore } from '../../store/voiceStore';

/** Only an active private call needs controls; opening a DM never starts a call. */
export function DirectCallBar({ channelId }: { channelId: string }) {
  const currentChannelId = useVoiceStore(state => state.currentChannelId);
  const isConnected = useVoiceStore(state => state.isConnected);
  const isConnecting = useVoiceStore(state => state.isConnecting);
  const isMuted = useVoiceStore(state => state.isMuted);
  const toggleMute = useVoiceStore(state => state.toggleMute);
  const leaveVoice = useVoiceStore(state => state.leaveVoice);
  if (currentChannelId !== channelId || (!isConnected && !isConnecting)) return null;

  return <div aria-label="Личный звонок" className="flex items-center justify-between gap-3 border-b border-pati-border bg-pati-panel px-4 py-2 shrink-0">
    <span className="text-xs text-pati-text-muted">{isConnecting ? 'Соединяемся с собеседником…' : 'Личный звонок'}</span>
    <div className="flex items-center gap-2">
      {isConnected && <button type="button" onClick={toggleMute} aria-pressed={isMuted} aria-label={isMuted ? 'Включить микрофон' : 'Выключить микрофон'} title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'} className="rounded-lg bg-pati-surface-elevated p-2 text-pati-text-muted hover:text-white">
        {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
      </button>}
      <button type="button" onClick={() => leaveVoice()} aria-label="Завершить звонок" title="Завершить звонок" className="rounded-lg bg-pati-red/15 p-2 text-pati-red-text hover:bg-pati-red/25"><PhoneOff size={16} /></button>
    </div>
  </div>;
}
