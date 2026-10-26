import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { build } from 'esbuild';

const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key),
};
const instances = [];
let failMicrophone = false;
globalThis.TestRoom = class {
  listeners = new Map();
  disconnected = false;
  remoteParticipants = new Map();
  localParticipant = {
    identity: 'user', isMicrophoneEnabled: true,
    setMicrophoneEnabled: async () => { if (failMicrophone) throw new Error('Permission denied'); },
  };
  constructor() { instances.push(this); }
  on(event, handler) { this.listeners.set(event, handler); return this; }
  async connect() {}
  async disconnect() { this.disconnected = true; }
};
const bundle = await build({
  stdin: {
    contents: `export { useVoiceStore } from './src/store/voiceStore';
      export { useAuthStore } from './src/store/authStore';
      export { useChatStore } from './src/store/chatStore';
      export * from './src/utils/files';`,
    resolveDir: process.cwd(),
  },
  bundle: true, write: false, platform: 'node', format: 'esm',
  define: { 'import.meta.env': '{"VITE_API_URL":"https://api.example.test"}' },
  plugins: [{ name: 'mock-livekit', setup(builder) {
    builder.onResolve({ filter: /^livekit-client$/ }, () => ({ path: 'livekit', namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents:
      `export const Room = globalThis.TestRoom;
       export const Track = { Source: { Microphone: 'microphone', ScreenShareAudio: 'screen_share_audio' } };
       export const RoomEvent = new Proxy({}, {get: (_, key) => key});`, loader: 'js' }));
  } }],
});
const { useVoiceStore: voice, useAuthStore: auth, useChatStore: chat, protectedFileUrl, fetchPrivateFile } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);
beforeEach(() => {
  auth.getState().logout();
  auth.getState().setAuth('token', { id: 'user', display_name: 'User' });
  chat.setState({ channels: [{ id: 'private', name: 'Private', is_direct: true }] });
  instances.length = 0;
  failMicrophone = false;
  voice.setState({ participantVolumes: {} });
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ token: 'room-token', server_url: 'wss://voice.test' }) });
});

test('voice requests a channel ID and disconnects on logout', async () => {
  let body;
  globalThis.fetch = async (_, options) => {
    body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ token: 'room-token' }) };
  };
  assert.equal(await voice.getState().joinVoice('private'), true);
  assert.deepEqual(body, { channel_id: 'private' });
  assert.equal(voice.getState().currentChannelId, 'private');
  auth.getState().logout();
  assert.equal(instances[0].disconnected, true);
  assert.equal(voice.getState().livekitRoom, null);
});

test('a token response received after logout cannot open the microphone', async () => {
  let resolve;
  globalThis.fetch = () => new Promise(done => { resolve = done; });
  const join = voice.getState().joinVoice('private');
  auth.getState().logout();
  resolve({ ok: true, json: async () => ({ token: 'stale' }) });
  assert.equal(await join, false);
  assert.equal(instances.length, 0);
});

test('microphone failure closes the room and shows an error', async t => {
  t.mock.method(console, 'error', () => {});
  failMicrophone = true;
  assert.equal(await voice.getState().joinVoice('private'), false);
  assert.equal(instances[0].disconnected, true);
  assert.equal(voice.getState().isConnected, false);
  assert.ok(voice.getState().error);
});

test('a disconnected event from an old room does not clear the new room', async () => {
  await voice.getState().joinVoice('private');
  const first = instances[0];
  await voice.getState().joinVoice('other');
  first.listeners.get('Disconnected')();
  assert.equal(voice.getState().currentChannelId, 'other');
  assert.equal(voice.getState().livekitRoom, instances[1]);
});

test('file authorization is never sent to a foreign origin', async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; };
  assert.equal(protectedFileUrl('https://foreign.test/uploads/secret'), null);
  await assert.rejects(fetchPrivateFile('https://foreign.test/uploads/secret', 'token'));
  assert.equal(called, false);
});

test('private download uses a header, removes query tokens and forbids redirects', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.example.test/uploads/file');
    assert.equal(options.headers.Authorization, 'Bearer token');
    assert.equal(options.redirect, 'error');
    return { ok: true, blob: async () => new Blob(['file']) };
  };
  const blob = await fetchPrivateFile('/uploads/file?token=old', 'token');
  assert.equal(await blob.text(), 'file');
});


test('individual gain affects only the selected remote participant and survives republishing', async () => {
  await voice.getState().joinVoice('private');
  const gains = new Map();
  const remote = { identity: 'friend', name: 'Friend', getVolume: source => gains.get(source), setVolume: (value, source) => gains.set(source, value) };
  const untouched = new Map();
  const other = { identity: 'other', getVolume: source => untouched.get(source), setVolume: (value, source) => untouched.set(source, value) };
  instances[0].remoteParticipants.set('friend', remote);
  instances[0].remoteParticipants.set('other', other);
  voice.getState().setParticipantVolume('friend', 0.35);
  assert.equal(gains.get('microphone'), 0.35);
  assert.equal(gains.get('screen_share_audio'), 0.35);
  assert.equal(untouched.size, 0);
  voice.getState().setParticipantVolume('friend', 0);
  assert.equal(gains.get('microphone'), 0);
  gains.clear();
  instances[0].listeners.get('ParticipantConnected')();
  assert.equal(gains.get('microphone'), 0);
  assert.equal(untouched.get('microphone'), 1);
  voice.getState().setParticipantVolume('friend', 3);
  assert.equal(gains.get('microphone'), 1);
  voice.getState().setParticipantVolume('friend', NaN);
  assert.equal(voice.getState().participantVolumes.friend, 1);
  voice.getState().setParticipantVolume('user', 0);
  assert.equal(voice.getState().participantVolumes.user, undefined);
});

test('volume preferences are restored per listener account', () => {
  voice.getState().setParticipantVolume('friend', 0.42);
  auth.getState().logout();
  assert.deepEqual(voice.getState().participantVolumes, {});
  auth.getState().setAuth('other-token', { id: 'other-listener', display_name: 'Other' });
  assert.equal(voice.getState().participantVolumes.friend, undefined);
  auth.getState().setAuth('token', { id: 'user', display_name: 'User' });
  assert.equal(voice.getState().participantVolumes.friend, 0.42);
});


test('failed deafen does not claim a muted microphone', async () => {
  await voice.getState().joinVoice('private');
  failMicrophone = true;
  await voice.getState().toggleDeafen();
  assert.equal(voice.getState().isMuted, false);
  assert.equal(voice.getState().isDeafened, false);
  assert.ok(voice.getState().error);
});

test('a late screen-share operation cannot mark a new room as sharing', async () => {
  await voice.getState().joinVoice('private');
  const first = instances[0];
  let resolve;
  let stopped = false;
  first.localParticipant.setScreenShareEnabled = enabled => enabled ? new Promise(done => { resolve = done; }) : (stopped = true, Promise.resolve());
  const sharing = voice.getState().toggleScreenShare();
  await voice.getState().joinVoice('other');
  resolve(); await sharing;
  assert.equal(voice.getState().isScreenSharing, false);
  assert.equal(voice.getState().livekitRoom, instances[1]);
  assert.equal(stopped, true);
});

test('outgoing call waits for consent and ignores an older ringing event', async () => {
  const call = { id:'call-test', channel_id:'private', caller_id:'user', callee_id:'friend', status:'ringing', version:1 };
  globalThis.fetch = async url => ({ok:true, json:async () => String(url).includes('/messages') ? [] : String(url).includes('/calls') ? call : {token:'room-token'}});
  assert.equal(await voice.getState().startCall('private'), true);
  assert.equal(instances.length, 0);
  voice.getState().handleCallEvent({...call,status:'accepted',version:2});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(instances.length, 1);
  voice.getState().handleCallEvent(call);
  assert.equal(voice.getState().call.status, 'accepted');
  voice.getState().handleCallEvent({...call,status:'ended',version:3});
  assert.equal(voice.getState().livekitRoom, null);
  assert.equal(voice.getState().call, null);
});
