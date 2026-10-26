import { ParticipantVolume } from './ParticipantVolume';
import { useEffect, useState } from 'react';
import { Headphones, Mic, MicOff, MonitorUp, PhoneOff } from 'lucide-react';
import { useVoiceStore } from '../../store/voiceStore';
import { Channel, VoiceParticipant } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { API_BASE_URL } from '../../utils/config';
import { Avatar } from '../ui/Avatar';

export function RoomVoicePanel({ channel }: { channel: Channel }) {
  const voice = useVoiceStore();
  const [joinError, setJoinError] = useState('');
  const here = voice.currentChannelId === channel.id;
  const connected = here && voice.isConnected;
  const connecting = here && voice.isConnecting;
  const elsewhere = !here && (voice.isConnected || voice.isConnecting);
  const token = useAuthStore(state => state.token);
  const [preview, setPreview] = useState<VoiceParticipant[] | null>(null);
  const [previewError, setPreviewError] = useState(false);
  useEffect(() => {
    if (connected || !token) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setPreview(null); setPreviewError(false);
    async function refresh() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/livekit/channels/${channel.id}/participants`, {
          headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
        });
        if (!response.ok) throw new Error('participants');
        const people: VoiceParticipant[] = await response.json();
        if (!controller.signal.aborted) { setPreview(people); setPreviewError(false); }
      } catch {
        if (!controller.signal.aborted) setPreviewError(true);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 5000);
      }
    }
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [channel.id, connected, token]);
  const participants = connected ? voice.participants : preview ?? [];
  async function connect() {
    setJoinError('');
    if (!await voice.joinVoice(channel.id) && useVoiceStore.getState().error) setJoinError('Не удалось подключиться. Проверьте разрешение на микрофон и попробуйте снова.');
  }
  return <section aria-label="Голос комнаты" className="border-t border-pati-border pt-4 mt-2 flex-1 min-h-0 flex flex-col">
    <h3 className="w-full flex items-center gap-2 text-xs font-bold text-pati-text-secondary py-2 shrink-0">
      <Headphones className="w-4 h-4 text-pati-accent-light" /> ГОЛОС
      {(connected || preview !== null) && <span className="ml-auto text-pati-green-light">{participants.length}</span>}
    </h3>
    <div className="pt-2 space-y-3 flex-1 min-h-0 overflow-y-auto">
      <p className="text-xs text-pati-text-muted break-words">{connected ? 'Вы в разговоре' : connecting ? 'Подключаемся…' : `Разговор в комнате «${channel.name}»`}</p>
      {elsewhere && <p className="text-xs text-pati-warning-text/80 break-words">Вы в голосе: {voice.currentRoomName}. Подключение сюда завершит предыдущий разговор.</p>}
      {!connected && previewError && <p role="status" className="text-xs text-pati-text-muted">Не удалось обновить участников. Повторяем попытку…</p>}
      {!connected && preview === null && !previewError && <p className="text-xs text-pati-text-muted">Загружаем участников…</p>}
      {(connected || preview !== null) && participants.length === 0 && <p className="text-xs text-pati-text-muted">В разговоре пока никого нет</p>}
      <div className="space-y-1" aria-label="Участники голосового разговора">{participants.map(person => <div key={person.identity} className={`rounded-xl p-2 border ${person.isSpeaking ? 'border-pati-green/50 bg-pati-green/10' : 'border-transparent bg-pati-surface'}`}>
        <div className="flex items-center gap-2">
        <Avatar name={person.name} url={person.avatar_url} size="sm" />
        <div className="min-w-0 flex-1"><p className="text-xs text-white truncate">{person.name}</p><p className="text-[10px] text-pati-text-muted">{person.isSpeaking ? 'Говорит' : person.isMuted ? 'Микрофон выключен' : 'В разговоре'}</p></div>
        {person.isMuted && <MicOff className="w-3.5 h-3.5 text-pati-text-muted shrink-0" />}
        </div>
        {connected && <ParticipantVolume identity={person.identity} name={person.name} />}
      </div>)}</div>
      {(joinError || (here && voice.error)) && <p role="alert" className="text-xs text-pati-red-text">{joinError || voice.error}</p>}
    </div>
    {!connected && <div className="shrink-0 pt-3 mt-3 border-t border-pati-border">
      {connecting ? <button onClick={() => voice.leaveVoice()} className="w-full py-2.5 text-xs text-pati-red-text rounded-xl bg-pati-red/10">Отменить подключение</button> : <button disabled={voice.isConnecting} onClick={() => void connect()} className="w-full py-2.5 rounded-xl bg-pati-accent hover:bg-pati-accent-hover text-xs font-semibold text-white disabled:opacity-50">Подключиться к разговору</button>}
    </div>}
    {connected && (
        <div className="grid grid-cols-4 gap-1 shrink-0 pt-3 mt-3 border-t border-pati-border">
          <button title={voice.isMuted ? 'Включить микрофон' : 'Выключить микрофон'} aria-label={voice.isMuted ? 'Включить микрофон' : 'Выключить микрофон'} aria-pressed={voice.isMuted} onClick={voice.toggleMute} className={`p-2.5 rounded-lg flex justify-center ${voice.isMuted ? 'bg-pati-red/15 text-pati-red-text' : 'bg-pati-surface-elevated text-white'}`}>{voice.isMuted ? <MicOff size={16} /> : <Mic size={16} />}</button>
          <button title={voice.isDeafened ? 'Включить звук' : 'Выключить звук'} aria-label={voice.isDeafened ? 'Включить звук' : 'Выключить звук'} aria-pressed={voice.isDeafened} onClick={voice.toggleDeafen} className={`p-2.5 rounded-lg flex justify-center ${voice.isDeafened ? 'bg-pati-red/15 text-pati-red-text' : 'bg-pati-surface-elevated text-white'}`}><Headphones size={16} /></button>
          <button title={voice.isScreenSharing ? 'Остановить демонстрацию' : 'Показать экран'} aria-label={voice.isScreenSharing ? 'Остановить демонстрацию' : 'Показать экран'} aria-pressed={voice.isScreenSharing} onClick={() => void voice.toggleScreenShare()} className={`p-2.5 rounded-lg flex justify-center ${voice.isScreenSharing ? 'bg-pati-accent/25 text-pati-accent-text' : 'bg-pati-surface-elevated text-white'}`}><MonitorUp size={16} /></button>
          <button title="Выйти из разговора" aria-label="Выйти из разговора" onClick={() => voice.leaveVoice()} className="p-2.5 rounded-lg flex justify-center bg-pati-red/15 text-pati-red-text hover:bg-pati-red/25"><PhoneOff size={16} /></button>
        </div>
    )}
  </section>;
}
