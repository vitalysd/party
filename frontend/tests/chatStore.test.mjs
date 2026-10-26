import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { build } from 'esbuild';

const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key),
};
globalThis.WebSocket = class {
  static OPEN = 1;
  static CONNECTING = 0;
  readyState = 1;
  close() {}
};
const bundle = await build({
  stdin: {
    contents: "export { useChatStore } from './src/store/chatStore'; export { useAuthStore } from './src/store/authStore';",
    resolveDir: process.cwd(),
  },
  bundle: true, write: false, platform: 'node', format: 'esm',
  define: { 'import.meta.env': '{}' },
});
const { useChatStore: chat, useAuthStore: auth } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);
const user = { id: 'user', display_name: 'User' };
test('cached history including an empty chat avoids repeated requests', async () => {
  auth.getState().logout(); auth.getState().setAuth('cache-token', user);
  let requests = 0;
  globalThis.fetch = async () => { requests++; return { ok: true, json: async () => [] }; };
  await chat.getState().ensureMessages('empty');
  await chat.getState().ensureMessages('empty');
  assert.equal(requests, 1);
});

test('simultaneous history consumers share one request', async () => {
  let resolve;
  let requests = 0;
  globalThis.fetch = () => { requests++; return new Promise(done => { resolve = done; }); };
  const first = chat.getState().ensureMessages('chat');
  const second = chat.getState().ensureMessages('chat');
  assert.equal(requests, 1);
  resolve({ ok: true, json: async () => [] });
  await Promise.all([first, second]);
});

test('known personal chat opens without contacting the server', async () => {
  chat.setState({ channels: [{id:'known-dm',is_direct:true,members:[{user_id:'user'},{user_id:'friend'}]}] });
  globalThis.fetch = async () => { throw new Error('Unexpected request'); };
  assert.equal(await chat.getState().openDM('friend', false), 'known-dm');
});
const message = (id, content = id) => ({
  id, content, channel_id: 'chat', sender_id: 'user', reactions: [], created_at: '2026-01-01T00:00:00Z',
});
beforeEach(() => {
  auth.getState().logout();
  auth.getState().setAuth('token', user);
  chat.setState({ activeChannelId: 'chat', channels: [{ id: 'chat', name: 'Chat', members: [] }] });
});

test('HTTP failure keeps the text and attachments with a failed status', async t => {
  t.mock.method(console, 'error', () => {});
  globalThis.fetch = async () => ({ ok: false });
  const attachments = [{ url: '/file', filename: 'file' }];
  await chat.getState().sendMessage('chat', 'Keep me', attachments);
  const [saved] = chat.getState().messages.chat;
  assert.equal(saved.content, 'Keep me');
  assert.deepEqual(saved.attachments, attachments);
  assert.equal(saved.is_failed, true);
  assert.equal(saved.is_pending, false);
});

test('history request preserves messages received while loading', async () => {
  let resolve;
  globalThis.fetch = () => new Promise(done => { resolve = done; });
  const request = chat.getState().loadMessages('chat');
  chat.setState({ messages: { chat: [message('live')] } });
  resolve({ ok: true, json: async () => [message('history')] });
  await request;
  assert.deepEqual(chat.getState().messages.chat.map(m => m.id), ['history', 'live']);
});

test('logout clears private data and ignores a delayed history response', async () => {
  let resolve;
  globalThis.fetch = () => new Promise(done => { resolve = done; });
  chat.setState({ messages: { chat: [message('private')] } });
  const request = chat.getState().loadMessages('chat');
  auth.getState().logout();
  resolve({ ok: true, json: async () => [message('secret')] });
  await request;
  assert.deepEqual(chat.getState().messages, {});
  assert.equal(chat.getState().activeChannelId, null);
});

test('HTTP confirmation removes its placeholder when the event arrived first', async () => {
  let resolve;
  globalThis.fetch = () => new Promise(done => { resolve = done; });
  const request = chat.getState().sendMessage('chat', 'hello');
  const saved = message('saved', 'hello');
  chat.setState({ messages: { chat: [...chat.getState().messages.chat, saved] } });
  resolve({ ok: true, json: async () => saved });
  await request;
  assert.deepEqual(chat.getState().messages.chat, [saved]);
});

test('a slower history request cannot overwrite a newer response', async () => {
  const responses = [];
  globalThis.fetch = () => new Promise(resolve => responses.push(resolve));
  const first = chat.getState().loadMessages('chat');
  const second = chat.getState().loadMessages('chat');
  responses[1]({ ok: true, json: async () => [message('new')] });
  await second;
  responses[0]({ ok: true, json: async () => [message('old')] });
  await first;
  assert.deepEqual(chat.getState().messages.chat.map(m => m.id), ['new']);
});

test('retry preserves the request, attachment and original reply and prevents double clicks', async t => {
  t.mock.method(console, 'error', () => {});
  const bodies = [];
  globalThis.fetch = async (_, options) => {
    bodies.push(JSON.parse(options.body));
    throw new Error('Connection lost after commit');
  };
  chat.getState().setReplyingTo(message('original-reply'));
  await chat.getState().sendMessage('chat', 'hello', [{ url: '/file', filename: 'image' }]);
  const failed = chat.getState().messages.chat[0];
  chat.getState().setReplyingTo(message('different-reply'));
  let resolve;
  globalThis.fetch = (_, options) => {
    bodies.push(JSON.parse(options.body));
    return new Promise(done => { resolve = done; });
  };
  const firstRetry = chat.getState().retryMessage('chat', failed.id);
  await chat.getState().retryMessage('chat', failed.id);
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[0], bodies[1]);
  resolve({ ok: true, json: async () => ({ ...message('saved'), client_request_id: failed.client_request_id }) });
  await firstRetry;
  assert.deepEqual(chat.getState().messages.chat.map(m => m.id), ['saved']);
});

test('WebSocket confirmation reconciles the pending message even when HTTP fails', async t => {
  t.mock.method(console, 'error', () => {});
  let reject;
  globalThis.fetch = () => new Promise((_, fail) => { reject = fail; });
  chat.getState().initWebSocket();
  const send = chat.getState().sendMessage('chat', 'hello');
  const pending = chat.getState().messages.chat[0];
  const saved = { ...message('saved', 'hello'), client_request_id: pending.client_request_id };
  chat.getState().socket.onmessage({ data: JSON.stringify({ type: 'NEW_MESSAGE', data: saved }) });
  reject(new Error('Response lost'));
  await send;
  assert.deepEqual(chat.getState().messages.chat, [saved]);
});

test('two identical texts retain separate request identities', async () => {
  const pending = [];
  globalThis.fetch = (_, options) => new Promise(resolve => pending.push({ body: JSON.parse(options.body), resolve }));
  const first = chat.getState().sendMessage('chat', 'same');
  const second = chat.getState().sendMessage('chat', 'same');
  assert.notEqual(pending[0].body.client_request_id, pending[1].body.client_request_id);
  pending.forEach((request, i) => request.resolve({ ok: true,
    json: async () => ({ ...message(`saved${i}`, 'same'), client_request_id: request.body.client_request_id }) }));
  await Promise.all([first, second]);
  assert.equal(chat.getState().messages.chat.length, 2);
  assert.ok(chat.getState().messages.chat.every(m => !m.is_pending));
});

test('history reconciles a failed placeholder after the response was lost', async t => {
  t.mock.method(console, 'error', () => {});
  globalThis.fetch = async () => { throw new Error('Response lost'); };
  await chat.getState().sendMessage('chat', 'hello');
  const failed = chat.getState().messages.chat[0];
  const saved = { ...message('saved', 'hello'), client_request_id: failed.client_request_id };
  globalThis.fetch = async () => ({ ok: true, json: async () => [saved] });
  await chat.getState().loadMessages('chat');
  assert.deepEqual(chat.getState().messages.chat, [saved]);
});

test('older page uses a confirmed cursor and preserves live events without duplicate requests', async () => {
  const oldest = { ...message('oldest'), created_at: '2026-01-01T00:00:01Z' };
  const failed = { ...message('local'), is_failed: true };
  chat.setState({ messages: { chat: [failed, oldest] }, hasMoreMessages: { chat: true } });
  let resolve;
  let calls = 0;
  globalThis.fetch = url => {
    calls++;
    assert.equal(new URL(url).searchParams.get('before_id'), 'oldest');
    return new Promise(done => { resolve = done; });
  };
  const request = chat.getState().loadOlderMessages('chat');
  await chat.getState().loadOlderMessages('chat');
  assert.equal(calls, 1);
  chat.setState({ messages: { chat: [...chat.getState().messages.chat,
    { ...message('live'), created_at: '2026-01-01T00:00:02Z' }] } });
  resolve({ ok: true, json: async () => [message('history')] });
  await request;
  assert.deepEqual(new Set(chat.getState().messages.chat.map(m => m.id)), new Set(['history', 'local', 'oldest', 'live']));
  assert.equal(chat.getState().hasMoreMessages.chat, false);
  assert.equal(chat.getState().loadingOlder.chat, false);
});

test('microsecond ordering is retained for the next history cursor', async () => {
  const early = { ...message('z'), created_at: '2026-01-01T00:00:00.123001+00:00' };
  const late = { ...message('a'), created_at: '2026-01-01T00:00:00.123002+00:00' };
  globalThis.fetch = async () => ({ ok: true, json: async () => [late, early] });
  await chat.getState().loadMessages('chat');
  assert.deepEqual(chat.getState().messages.chat.map(m => m.id), ['z', 'a']);
});

test('a stalled send times out and becomes retryable', async t => {
  t.mock.method(console, 'error', () => {});
  let timeout;
  t.mock.method(globalThis, 'setTimeout', callback => { timeout = callback; return 0; });
  globalThis.fetch = (_, options) => new Promise((_, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('Aborted')));
  });
  const send = chat.getState().sendMessage('chat', 'timeout');
  timeout();
  await send;
  assert.equal(chat.getState().messages.chat[0].is_failed, true);
  assert.equal(chat.getState().messages.chat[0].is_pending, false);
});


test('background DM increments unread once and opening it clears the badge', () => {
  chat.setState({channels:[{id:'chat',name:'Chat',members:[]},{id:'dm',name:'Friend',members:[],is_direct:true}]});
  chat.getState().initWebSocket();
  const incoming = {...message('incoming'),channel_id:'dm',sender_id:'friend'};
  const event = {data:JSON.stringify({type:'NEW_MESSAGE',data:incoming})};
  chat.getState().socket.onmessage(event);
  chat.getState().socket.onmessage(event);
  assert.equal(chat.getState().unreadCounts.dm, 1);
  globalThis.fetch = async () => ({ok:true,json:async()=>[incoming]});
  chat.getState().socket.send = () => {};
  chat.getState().setActiveChannel('dm');
  assert.equal(chat.getState().unreadCounts.dm, 0);
});
