import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
globalThis.localStorage = { getItem:()=>null, setItem:()=>{}, removeItem:()=>{} };
const bundle = await build({ stdin: { contents: "export * from './src/utils/imageCache';", resolveDir: process.cwd() }, bundle:true, write:false, platform:'node', format:'esm', define:{'import.meta.env':'{}'} });
const cache = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('images share downloads, survive unmount and release URLs on session change', async () => {
  let requests = 0;
  globalThis.fetch = async () => { requests++; return { ok:true, blob:async()=>new Blob(['image']) }; };
  const first = cache.acquireImage('/uploads/avatar.png', 'alice');
  const second = cache.acquireImage('/uploads/avatar.png', 'alice');
  const [one, two] = await Promise.all([first.promise, second.promise]);
  assert.equal(one, two); assert.equal(requests, 1);
  first.release(); second.release();
  const reopened = cache.acquireImage('/uploads/avatar.png', 'alice');
  assert.equal(await reopened.promise, one); assert.equal(requests, 1);
  assert.equal(cache.cachedImageUrl('/uploads/avatar.png', 'bob'), undefined);
  reopened.release(); cache.clearImageCache();
  assert.equal(cache.cachedImageUrl('/uploads/avatar.png', 'alice'), undefined);
});

test('failed image downloads can be retried', async () => {
  globalThis.fetch = async () => ({ok:false});
  const failed = cache.acquireImage('/uploads/retry.png', 'alice');
  await assert.rejects(failed.promise); failed.release();
  globalThis.fetch = async () => ({ok:true,blob:async()=>new Blob(['retry'])});
  const retry = cache.acquireImage('/uploads/retry.png', 'alice');
  assert.match(await retry.promise, /^blob:/);
  retry.release(); cache.clearImageCache();
});
