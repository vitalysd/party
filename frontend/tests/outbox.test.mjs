import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
const values = new Map();
globalThis.localStorage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
const bundle = await build({ entryPoints: ['src/utils/outbox.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { saveOutbox, restoreOutbox, clearOutbox } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
test('reload preserves failed message identity and attachments without resending it', () => {
  const message = { id: 'temp-1', sender_id: 'a', channel_id: 'room', content: 'hello', client_request_id: 'request', is_pending: true, attachments: [{url:'/api/v1/files/a'}] };
  saveOutbox('a', {room:[message, {...message,id:'confirmed',is_pending:false}]});
  const restored = restoreOutbox('a').room;
  assert.equal(restored.length, 1);
  assert.equal(restored[0].is_failed, true);
  assert.equal(restored[0].is_pending, false);
  assert.equal(restored[0].client_request_id, 'request');
  assert.deepEqual(restored[0].attachments, message.attachments);
  assert.deepEqual(restoreOutbox('b'), {});
  clearOutbox('a');
  assert.deepEqual(restoreOutbox('a'), {});
});
test('corrupt persisted queue does not prevent application startup', () => {
  values.set('pati_outbox:a', '{');
  assert.deepEqual(restoreOutbox('a'), {});
});
