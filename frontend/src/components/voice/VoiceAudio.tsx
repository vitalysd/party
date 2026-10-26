import { RoomAudioRenderer } from '@livekit/components-react';
import { useVoiceStore } from '../../store/voiceStore';

export function VoiceAudio() {
  const room = useVoiceStore(state => state.livekitRoom);
  const muted = useVoiceStore(state => state.isDeafened);
  return room ? <RoomAudioRenderer room={room} muted={muted} /> : null;
}
