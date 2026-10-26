import { useTracks, VideoTrack } from '@livekit/components-react';
import { Room, Track } from 'livekit-client';
import { useState } from 'react';
import { useVoiceStore } from '../../store/voiceStore';

export function ChatScreenShares({ channelId }: { channelId: string }) {
  const room = useVoiceStore(state => state.isConnected && state.currentChannelId === channelId ? state.livekitRoom : null);
  return room ? <ScreenShares key={channelId} room={room} inChat /> : null;
}

export function ScreenShares({ room, inChat = false }: { room: Room; inChat?: boolean }) {
  const tracks = useTracks([Track.Source.ScreenShare], { room, onlySubscribed: true });
  const [selectedSid, setSelectedSid] = useState<string>();
  if (!tracks.length) return null;
  if (inChat) {
    const selected = tracks.find(track => track.publication.trackSid === selectedSid) ?? tracks[0];
    return <section aria-label="Демонстрация экрана" className="basis-[70%] shrink-0 min-h-0 flex flex-col overflow-hidden border-b border-pati-border bg-pati-panel">
      <div className="flex items-center gap-2 px-3 py-2 shrink-0 overflow-x-auto text-xs text-pati-text-secondary">
        {tracks.length === 1 ? <span className="truncate">Экран: {selected.participant.name || selected.participant.identity}</span> : tracks.map(track => <button
          key={track.publication.trackSid} type="button" aria-pressed={selected === track}
          onClick={() => setSelectedSid(track.publication.trackSid)}
          className={`shrink-0 max-w-60 truncate rounded-lg px-3 py-1.5 ${selected === track ? 'bg-pati-accent/20 text-pati-accent-text' : 'hover:bg-pati-surface'}`}
        >Экран: {track.participant.name || track.participant.identity}</button>)}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden bg-black">
        <VideoTrack key={selected.publication.trackSid} trackRef={selected} className="w-full h-full object-contain" />
      </div>
    </section>;
  }
  return <>{tracks.map(track => <figure key={track.publication.trackSid} className="space-y-2">
    <figcaption className="text-sm text-white">Экран: {track.participant.name || track.participant.identity}</figcaption>
    <VideoTrack trackRef={track} className="w-full rounded-xl bg-black" />
  </figure>)}</>;
}
