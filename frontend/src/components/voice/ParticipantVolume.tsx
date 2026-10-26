import { Volume2, VolumeX } from 'lucide-react';
import { useVoiceStore } from '../../store/voiceStore';
import { useAuthStore } from '../../store/authStore';

export function ParticipantVolume({ identity, name }: { identity: string; name: string }) {
  const userId = useAuthStore(state => state.user?.id);
  const volume = useVoiceStore(state => state.participantVolumes[identity] ?? 1);
  const setVolume = useVoiceStore(state => state.setParticipantVolume);
  if (identity === userId) return null;
  const percent = Math.round(volume * 100);
  return <label className="flex items-center gap-2 w-full pt-2 text-pati-text-muted" title="Громкость только для вас">
    {percent === 0 ? <VolumeX size={14} className="shrink-0 text-pati-red-text" /> : <Volume2 size={14} className="shrink-0" />}
    <span className="sr-only">Громкость {name}</span>
    <input type="range" min="0" max="100" step="1" value={percent} aria-valuetext={`${percent}%`} onChange={event => setVolume(identity, Number(event.target.value) / 100)} className="min-w-0 flex-1 h-5 accent-pati-accent cursor-pointer" />
    <span className="text-[10px] tabular-nums w-8 text-right">{percent}%</span>
  </label>;
}
