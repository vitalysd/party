import { readParticipantVolumes, saveParticipantVolumes } from '../utils/participantVolumes';
import { registerVoiceSignals } from '../utils/voiceSignals';
import { create } from 'zustand';
import { Room, RoomEvent, RemoteParticipant, LocalParticipant, Track } from 'livekit-client';
import { VoiceParticipant, PrivateCall } from '../types';
import { API_BASE_URL, LIVEKIT_SERVER_URL } from '../utils/config';
import { useAuthStore } from './authStore';
import { useChatStore } from './chatStore';

interface VoiceState {
  currentRoomName: string | null;
  currentChannelId: string | null;
  error: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isScreenSharing: boolean;
  connectionQuality: 'excellent' | 'good' | 'poor';
  pingMs: number;
  participantVolumes: Record<string, number>;
  setParticipantVolume: (identity: string, volume: number) => void;
  participants: VoiceParticipant[];
  livekitRoom: Room | null;

  joinVoice: (channelId: string) => Promise<boolean>;
  joinDefaultVoice: () => Promise<boolean>;
  joinDirectVoice: (userId: string) => Promise<boolean>;
  call: PrivateCall | null;
  callNotice: string | null;
  startCall: (channelId: string) => Promise<boolean>;
  acceptCall: () => Promise<void>;
  endCall: () => Promise<void>;
  handleCallEvent: (call: PrivateCall) => void;
  syncCall: () => Promise<void>;
  leaveVoice: (notifyCall?: boolean) => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleScreenShare: () => Promise<void>;
}

function applyVolume(participant: RemoteParticipant, volume: number) {
  // LiveKit retains these gains for tracks published later as well.
  for (const source of [Track.Source.Microphone, Track.Source.ScreenShareAudio] as const) {
    if (participant.getVolume(source) !== volume) participant.setVolume(volume, source);
  }
}

const callVersions = new Map<string, number>();
const callIntents = new Set<string>();
let pendingOutgoingChannel: string | null = null;
async function callRequest(path: string, method = 'POST', body?: unknown) {
  const token = useAuthStore.getState().token;
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/calls${path}`, { method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (useAuthStore.getState().token !== token) return undefined;
  const data = await response.json();
  if (useAuthStore.getState().token !== token) return undefined;
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Не удалось выполнить действие со звонком');
    return data;
  } catch (error) {
    if (useAuthStore.getState().token !== token) return undefined;
    throw error;
  }
}
let joinSequence = 0;

export const useVoiceStore = create<VoiceState>((set, get) => ({
  currentRoomName: null,
  currentChannelId: null,
  error: null,
  isConnected: false,
  isConnecting: false,
  isMuted: false,
  isDeafened: false,
  isScreenSharing: false,
  connectionQuality: 'excellent',
  pingMs: 24,
  participants: [],
  livekitRoom: null,

  call: null,
  callNotice: null,
  startCall: async channelId => {
    pendingOutgoingChannel = channelId;
    set({ error: null, callNotice: null });
    try {
      const call = await callRequest('', 'POST', { channel_id: channelId });
      if (call) { callIntents.add(call.id); get().handleCallEvent(call); }
      return !!call;
    } catch (error) {
      pendingOutgoingChannel = null;
      set({ error: error instanceof Error ? error.message : 'Не удалось позвонить' });
      return false;
    }
  },
  acceptCall: async () => {
    const call = get().call;
    if (!call) return;
    callIntents.add(call.id);
    try {
      const accepted = await callRequest(`/${call.id}/accept`);
      if (accepted) get().handleCallEvent(accepted);
    } catch (error) { callIntents.delete(call.id); set({ error: error instanceof Error ? error.message : 'Не удалось принять звонок' }); }
  },
  endCall: async () => {
    const call = get().call;
    if (!call) return;
    try {
      const ended = await callRequest(`/${call.id}/end`);
      if (ended) get().handleCallEvent(ended);
    } catch {
      get().leaveVoice(false);
      set({ call: null, error: 'Звонок отключён локально. Сервер недоступен.' });
      callIntents.delete(call.id); pendingOutgoingChannel = null;
    }
  },
  handleCallEvent: call => {
    const userId = useAuthStore.getState().user?.id;
    if (!call?.id || !userId || ![call.caller_id, call.callee_id].includes(userId)) return;
    if (call.version <= (callVersions.get(call.id) ?? 0)) return;
    callVersions.set(call.id, call.version);
    if (callVersions.size > 512) callVersions.delete(callVersions.keys().next().value!);
    if (call.status === 'ended') {
      callIntents.delete(call.id);
      if (get().call?.id === call.id) {
        if (get().currentChannelId === call.channel_id) get().leaveVoice(false);
        set({ call: null, error: null, callNotice: call.reason === 'timeout' ? 'Собеседник не ответил на звонок' : call.reason === 'offline' ? 'Собеседник отключился' : null });
        pendingOutgoingChannel = null;
      }
      return;
    }
    set({ call });
    if (call.status === 'accepted') {
      const intended = callIntents.has(call.id) || (call.caller_id === userId && pendingOutgoingChannel === call.channel_id);
      if (intended && (get().currentChannelId !== call.channel_id || (!get().isConnected && !get().isConnecting))) {
        callIntents.add(call.id); pendingOutgoingChannel = null;
        void (async () => {
          if (!useChatStore.getState().channels.some(channel => channel.id === call.channel_id)) await useChatStore.getState().loadChannels();
          if (get().call?.id !== call.id || get().call?.status !== 'accepted') return;
          if (!useChatStore.getState().channels.some(channel => channel.id === call.channel_id)) {
            await get().endCall();
            set({ error: 'Не удалось открыть переписку звонка' });
            return;
          }
          useChatStore.getState().setActiveChannel(call.channel_id);
          await get().joinVoice(call.channel_id);
        })();
      }
    }
  },
  syncCall: async () => {
    try {
      const call = await callRequest('/current', 'GET');
      if (call === undefined) return;
      if (call?.id) get().handleCallEvent(call);
      else if (get().call) { get().leaveVoice(false); set({ call: null }); }
    } catch { /* Preserve an established conversation through a short signalling outage. */ }
  },

  participantVolumes: readParticipantVolumes(useAuthStore.getState().user?.id),
  setParticipantVolume: (identity, value) => {
    if (!Number.isFinite(value) || identity === useAuthStore.getState().user?.id) return;
    const volume = Math.min(1, Math.max(0, value));
    const participantVolumes = { ...get().participantVolumes, [identity]: volume };
    const participant = get().livekitRoom?.remoteParticipants.get(identity);
    if (participant) applyVolume(participant, volume);
    set({ participantVolumes });
    saveParticipantVolumes(useAuthStore.getState().user?.id, participantVolumes);
  },

  joinDefaultVoice: async () => {
    const channel = useChatStore.getState().channels.find(c => c.type === 'voice' && !c.is_direct);
    if (!channel) { set({ error: 'Голосовой канал не найден' }); return false; }
    return get().joinVoice(channel.id);
  },

  joinDirectVoice: async (userId: string) => {
    const channelId = await useChatStore.getState().openDM(userId);
    if (!channelId) { set({ error: 'Не удалось открыть личный канал' }); return false; }
    return get().startCall(channelId);
  },

  joinVoice: async (channelId: string) => {
    const { token, user } = useAuthStore.getState();
    if (!token || !user) return false;

    get().leaveVoice(get().call?.channel_id !== channelId);
    const attempt = ++joinSequence;
    const isCurrent = () => attempt === joinSequence && useAuthStore.getState().token === token;
    const roomName = useChatStore.getState().channels.find(c => c.id === channelId)?.name || 'Голосовой канал';
    let room: Room | null = null;
    set({ isConnecting: true, error: null, currentChannelId: channelId, currentRoomName: roomName });

    try {
      // 1. Request LiveKit access token from our FastAPI backend
      const res = await fetch(`${API_BASE_URL}/api/v1/livekit/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          channel_id: channelId,
        }),
      });

      if (!res.ok) throw new Error('Не удалось получить токен LiveKit');
      const { token: roomToken, server_url } = await res.json();

      if (!isCurrent()) return false;

      // 2. Initialize LiveKit Room instance
      room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      const activeRoom = room;
      set({ livekitRoom: room });
      const updateParticipantList = () => {
        if (!isCurrent()) return;
        const list: VoiceParticipant[] = [];

        // Add Local participant
        const local = activeRoom.localParticipant;
        list.push({
          identity: local.identity,
          name: `${user.display_name} (вы)`,
          avatar_url: user.avatar_url || undefined,
          isSpeaking: local.isSpeaking,
          isMuted: !local.isMicrophoneEnabled,
          isDeafened: get().isDeafened,
          isScreenSharing: local.isScreenShareEnabled,
          statusText: !local.isMicrophoneEnabled ? 'Микрофон выключен' : 'Микрофон включён',
        });

        // Add Remote participants
        activeRoom.remoteParticipants.forEach((p: RemoteParticipant) => {
          applyVolume(p, get().participantVolumes[p.identity] ?? 1);
          list.push({
            identity: p.identity,
            name: p.name || p.identity,
            avatar_url: p.metadata || undefined,
            isSpeaking: p.isSpeaking,
            isMuted: !p.isMicrophoneEnabled,
            isDeafened: false,
            isScreenSharing: p.isScreenShareEnabled,
            statusText: p.isSpeaking ? 'Говорит' : (!p.isMicrophoneEnabled ? 'Слушает' : 'В сети'),
          });
        });

        set({ participants: list });
      };

      // Register event listeners
      room
        .on(RoomEvent.Connected, () => {
          if (!isCurrent()) return;
          set({ isConnected: true, isConnecting: false });
          updateParticipantList();
        })
        .on(RoomEvent.Disconnected, () => {
          if (!isCurrent()) return;
          get().leaveVoice();
        })
        .on(RoomEvent.ActiveSpeakersChanged, () => {
          updateParticipantList();
        })
        .on(RoomEvent.ParticipantConnected, () => {
          updateParticipantList();
        })
        .on(RoomEvent.ParticipantDisconnected, () => {
          updateParticipantList();
        })
        .on(RoomEvent.TrackMuted, () => updateParticipantList())
        .on(RoomEvent.TrackUnmuted, () => updateParticipantList())
        .on(RoomEvent.LocalTrackPublished, () => updateParticipantList())
        .on(RoomEvent.LocalTrackUnpublished, () => updateParticipantList());

      // 3. Connect to LiveKit server
      await room.connect(server_url || LIVEKIT_SERVER_URL, roomToken);

      if (!isCurrent()) { await room.disconnect(); return false; }

      // 4. Enable microphone by default
      await room.localParticipant.setMicrophoneEnabled(true);
      if (!isCurrent()) { await room.disconnect(); return false; }

      set({
        livekitRoom: room,
        currentRoomName: roomName,
        currentChannelId: channelId,
        isConnected: true,
        isConnecting: false,
        isMuted: false,
      });

      updateParticipantList();
      return true;
    } catch (err) {
      console.error('Failed to join voice room:', err);
      if (isCurrent()) {
        get().leaveVoice();
        set({ error: 'Не удалось подключиться к голосовому каналу. Проверьте доступ и разрешение на микрофон.' });
      }
      if (room) await room.disconnect();
      return false;
    }
  },

  leaveVoice: (notifyCall = true) => {
    const call = get().call;
    if (notifyCall && call?.status === 'accepted' && call.channel_id === get().currentChannelId) {
      void callRequest(`/${call.id}/end`).catch(() => {});
      callIntents.delete(call.id); set({ call: null });
    }
    ++joinSequence;
    const room = get().livekitRoom;
    if (room) {
      room.disconnect();
    }
    set({
      currentRoomName: null,
      currentChannelId: null,
      isMuted: false, isDeafened: false, isScreenSharing: false,
      isConnected: false,
      isConnecting: false,
      participants: [],
      livekitRoom: null,
    });
  },

  toggleMute: async () => {
    const { livekitRoom, isMuted, isDeafened } = get();
    if (!livekitRoom || isDeafened) return;
    const newMuted = !isMuted;
    try {
      await livekitRoom.localParticipant.setMicrophoneEnabled(!newMuted);
      if (get().livekitRoom === livekitRoom) set({ isMuted: newMuted });
    } catch {
      if (get().livekitRoom === livekitRoom) set({ error: 'Не удалось переключить микрофон' });
    }
  },

  toggleDeafen: async () => {
    const { livekitRoom, isDeafened, isMuted } = get();
    const newDeafened = !isDeafened;

    if (!livekitRoom) return;
    if (newDeafened) {
      try {
        await livekitRoom.localParticipant.setMicrophoneEnabled(false);
      } catch {
        if (get().livekitRoom === livekitRoom) set({ error: 'Не удалось выключить микрофон. Звук и микрофон остались включены.' });
        return;
      }
    }
    if (get().livekitRoom !== livekitRoom) return;
    set({
      isDeafened: newDeafened,
      isMuted: newDeafened ? true : isMuted,
    });
  },

  toggleScreenShare: async () => {
    const { livekitRoom, isScreenSharing } = get();
    if (!livekitRoom) return;

    try {
      if (isScreenSharing) {
        await livekitRoom.localParticipant.setScreenShareEnabled(false);
        if (get().livekitRoom === livekitRoom) set({ isScreenSharing: false });
      } else {
        await livekitRoom.localParticipant.setScreenShareEnabled(true);
        if (get().livekitRoom !== livekitRoom) {
          await livekitRoom.localParticipant.setScreenShareEnabled(false);
          return;
        }
        set({ isScreenSharing: true });
      }
    } catch (err) {
      console.error('Error toggling screen share', err);
    }
  },
}));

useAuthStore.subscribe((state, previous) => {
  if (state.token !== previous.token) {
    useVoiceStore.getState().leaveVoice();
    useVoiceStore.setState({ call: null, callNotice: null });
    callVersions.clear(); callIntents.clear(); pendingOutgoingChannel = null;
  }
  if (state.user?.id !== previous.user?.id) {
    useVoiceStore.setState({ participantVolumes: readParticipantVolumes(state.user?.id) });
  }
});

registerVoiceSignals({
  call: call => useVoiceStore.getState().handleCallEvent(call),
  reconnect: () => { void useVoiceStore.getState().syncCall(); },
});

// A deleted channel must not leave an invisible microphone connection running.
useChatStore.subscribe((state, previous) => {
  if (state.channels === previous.channels) return;
  const channelId = useVoiceStore.getState().currentChannelId;
  if (channelId && !state.channels.some(channel => channel.id === channelId)) useVoiceStore.getState().leaveVoice();
});
