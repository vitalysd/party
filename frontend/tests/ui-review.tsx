// Development-only fixture page; not imported by the production entry point.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../src/App';
import { useChatStore } from '../src/store/chatStore';
import { useVoiceStore } from '../src/store/voiceStore';
import { useAuthStore } from '../src/store/authStore';
import '../src/index.css';
import { Room, RoomEvent, LocalVideoTrack, LocalTrackPublication, Track } from 'livekit-client';
import { TrackInfo, TrackSource, TrackType } from '@livekit/protocol';

const created_at = '2026-10-15T09:00:00Z';
let me = { id: 'review-me', username: 'review', display_name: 'Тестовый пользователь', custom_activity: 'Исходная активность', avatar_url: '', status: 'online', is_active: true, is_admin: true, created_at };
const friend = { ...me, id: 'review-friend', username: 'friend', display_name: 'Тестовый собеседник', custom_activity: 'Проверка интерфейса' };
const offlineFriend = { ...friend, id: 'review-offline', username: 'offline', display_name: 'Друг не в сети', status: 'offline', custom_activity: '' };
const channel = (id: string, name: string, type = 'text', is_direct = false) => ({
  id, name, type, is_direct, created_at,
  description: 'Локальные тестовые данные — не подключено к VPS',
  members: is_direct ? [{ user_id: me.id, user: me }, { user_id: friend.id, user: friend }] : [],
});
let channels = [channel('review-general', 'Проверка длинного названия общего канала'), channel('review-voice', 'Общий голосовой канал', 'voice'), channel('review-dm', friend.display_name, 'text', true)];
const messages = Array.from({ length: 50 }, (_, index) => ({
  id: `review-${index}`, channel_id: channels[0].id, sender_id: index % 2 ? me.id : friend.id,
  sender: index % 2 ? me : friend, content: index === 49
    ? 'Последнее сообщение для проверки интерфейса. Длинная_строка_без_пробелов_'.repeat(4)
    : `Тестовое сообщение ${index + 1}`, attachments: [], reactions: [],
  created_at: new Date(Date.parse(created_at) + index * 60000).toISOString(),
}));

let simulatedCall: any = null;
const exampleCall = (incoming = false) => ({id:crypto.randomUUID(), channel_id:'review-dm', caller_id: incoming ? friend.id : me.id, callee_id: incoming ? me.id : friend.id, caller_name: incoming ? friend.display_name : me.display_name, callee_name: incoming ? me.display_name : friend.display_name, status:'ringing', version:1, expires_at:new Date(Date.now()+30000).toISOString()});
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input), location.origin);
  const path = url.pathname;
  const body = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : {};
  const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  if (path.endsWith('/participants')) return reply([{ identity: friend.id, name: friend.display_name, isMuted: false, isSpeaking: false, isDeafened: false, isScreenSharing: false }]);
  if (path.endsWith('/auth/me')) return reply(me);
  if (path.endsWith('/calls/current')) return reply(simulatedCall);
  if (path.endsWith('/calls') && init?.method === 'POST') { simulatedCall = exampleCall(); return reply(simulatedCall, 201); }
  if (path.includes('/calls/') && path.endsWith('/end')) { const ended = { ...simulatedCall, status:'ended', version:3 }; simulatedCall = null; return reply(ended); }
  if (path.includes('/calls/') && path.endsWith('/accept')) { simulatedCall = { ...simulatedCall, status:'accepted', version:2 }; return reply(simulatedCall); }
  if (path.endsWith('/channels')) {
    if (init?.method === 'POST') { const item = { ...channel(crypto.randomUUID(), body.name, body.type), ...body }; channels.push(item); return reply(item, 201); }
    return reply(channels);
  }
  if (path.includes('/channels/') && ['PATCH', 'DELETE'].includes(init?.method ?? '')) {
    const id = path.split('/').pop();
    if (init?.method === 'DELETE') { channels = channels.filter(c => c.id !== id); return new Response(null, { status: 204 }); }
    channels = channels.map(c => c.id === id ? { ...c, ...body } : c);
    return reply(channels.find(c => c.id === id));
  }
  if (path.endsWith('/users')) return reply(new URLSearchParams(location.search).has('extra-friends') ? [me, friend, offlineFriend] : [me, friend]);
  if (path.includes('/channels/dm/')) {
    if (new URLSearchParams(location.search).has('slow-dm')) await new Promise(resolve => setTimeout(resolve, 700));
    if (new URLSearchParams(location.search).has('fail-dm')) return reply({ detail: 'Тестовая ошибка открытия личного чата' }, 503);
    if (path.endsWith(offlineFriend.id)) {
      let dm = channels.find(c => c.id === 'review-dm-offline');
      if (!dm) {
        dm = { ...channel('review-dm-offline', offlineFriend.display_name, 'text', true), members: [{ user_id: me.id, user: me }, { user_id: offlineFriend.id, user: offlineFriend }] };
        channels.push(dm);
      }
      return reply(dm);
    }
    return reply(channels[2]);
  }
  if (path.endsWith('/messages')) {
    if (init?.method === 'POST') return reply({ detail: 'Тестовая ошибка отправки' }, 503);
    if (new URLSearchParams(location.search).has('empty')) return reply([]);
    if (url.searchParams.has('before_id')) return reply([]);
    return reply(path.includes('review-dm') ? messages.slice(-3).map(m => ({ ...m, channel_id: 'review-dm' })) : messages);
  }
  if (path.endsWith('/users/me')) { me = { ...me, ...body }; return reply(me); }
  if (path.endsWith('/users/me/status')) return reply({ ...me, ...body });
  return reply({ detail: 'Операция отключена в локальной проверке' }, 503);
};
globalThis.WebSocket = class {
  static OPEN = 1; static CONNECTING = 0;
  readyState = 1;
  send() {} close() {}
} as unknown as typeof WebSocket;
useAuthStore.setState({ user: me as any, token: 'local-ui-fixture', isAuthenticated: true, fetchMe: async () => {} });
// Opt-in voice UI fixture: no network, microphone or audio device access.
if (new URLSearchParams(location.search).has('voice')) {
  const voiceChannel = new URLSearchParams(location.search).get('voice') === 'direct' ? channels[2] : channels[0];
  useVoiceStore.setState({
    currentChannelId: voiceChannel.id, currentRoomName: voiceChannel.name,
    isConnected: true, isMuted: false,
    participants: [
      { identity: me.id, name: 'Тестовый пользователь (вы)', isSpeaking: false, isMuted: false, isDeafened: false, isScreenSharing: false, statusText: 'В разговоре' },
      { identity: friend.id, name: friend.display_name, isSpeaking: true, isMuted: false, isDeafened: false, isScreenSharing: false, statusText: 'Говорит' },
    ],
    toggleMute: () => useVoiceStore.setState(state => ({ isMuted: !state.isMuted })),
    toggleDeafen: () => useVoiceStore.setState(state => ({ isDeafened: !state.isDeafened })),
  });
}
if (new URLSearchParams(location.search).has('incoming-call')) {
  simulatedCall = exampleCall(true);
  useVoiceStore.getState().handleCallEvent(simulatedCall);
}
if (new URLSearchParams(location.search).has('unread')) useChatStore.setState({unreadCounts:{'review-dm':2}});
if (new URLSearchParams(location.search).has('screen')) {
  const room = new Room();
  const canvas = document.createElement('canvas');
  canvas.width = 1280; canvas.height = 720;
  const ctx = canvas.getContext('2d')!;
  const draw = () => {
    ctx.fillStyle = '#182334'; ctx.fillRect(0, 0, 1280, 720);
    ctx.fillStyle = '#9c86ff'; ctx.fillRect(50, 50, 1180, 70);
    ctx.fillStyle = '#ffffff'; ctx.font = '36px sans-serif';
    ctx.fillText('Демонстрация экрана · тестовый рабочий стол', 80, 98);
    ctx.font = '26px sans-serif'; ctx.fillText('1280 × 720 — видео без обрезки', 80, 200);
  };
  draw();
  const timer = setInterval(draw, 100);
  const track = new LocalVideoTrack(canvas.captureStream(10).getVideoTracks()[0], undefined, true);
  const publication = new LocalTrackPublication(Track.Kind.Video, new TrackInfo({ sid: 'review-screen', name: 'Рабочий стол', source: TrackSource.SCREEN_SHARE, type: TrackType.VIDEO }), track);
  room.localParticipant.trackPublications.set(publication.trackSid, publication);
  room.localParticipant.videoTrackPublications.set(publication.trackSid, publication);
  useVoiceStore.setState({ livekitRoom: room, isScreenSharing: true });
  useVoiceStore.setState({ toggleScreenShare: async () => {
    room.localParticipant.trackPublications.clear(); room.localParticipant.videoTrackPublications.clear();
    room.emit(RoomEvent.LocalTrackUnpublished, publication, room.localParticipant);
    track.stop(); clearInterval(timer); useVoiceStore.setState({ isScreenSharing: false });
  } });
}
createRoot(document.getElementById('root')!).render(<App />);

