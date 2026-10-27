import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { build } from 'esbuild';

const browser = new Map();
let native = { present: false, session: null };
let loadOverride;
let instance = 0;
globalThis.localStorage = {
  getItem: key => browser.get(key) ?? null,
  setItem: (key, value) => browser.set(key, value),
  removeItem: key => browser.delete(key),
};
globalThis.sessionTestInvoke = async (command, args) => {
  if (command === 'load_session') return loadOverride ? loadOverride() : structuredClone(native);
  if (command === 'save_session') native = { present: true, session: structuredClone(args.session) };
};
const bundle = await build({
  stdin: { contents: "export { useAuthStore } from './src/store/authStore'; export { readNativeSession } from './src/utils/sessionStorage';", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'desktop-storage-bridge', setup(build) {
    build.onResolve({ filter: /\/config$/ }, () => ({ path: 'config', namespace: 'fixture' }));
    build.onResolve({ filter: /^@tauri-apps\/api\/core$/ }, () => ({ path: 'core', namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'config'
      ? "export const IS_DESKTOP=true; export const API_BASE_URL='https://server.test';"
      : 'export const invoke=(...args)=>globalThis.sessionTestInvoke(...args);' }));
  } }],
});
async function boot() {
  const module = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text + `\n// instance ${++instance}`).toString('base64')}`);
  return { auth: module.useAuthStore, flush: module.readNativeSession };
}
const user = { id: 'test-user', display_name: 'Test' };
beforeEach(() => { browser.clear(); native = { present:false,session:null }; loadOverride = undefined; });

test('desktop restores login after a full restart with empty WebView storage', async () => {
  const first = await boot();
  await first.auth.getState().restoreSession();
  first.auth.getState().setAuth('test-token', user);
  await first.flush();
  browser.clear();
  const second = await boot();
  assert.equal(second.auth.getState().sessionReady, false);
  await second.auth.getState().restoreSession();
  assert.equal(second.auth.getState().token, 'test-token');
  assert.equal(second.auth.getState().isAuthenticated, true);
  assert.equal(second.auth.getState().sessionReady, true);
});

test('explicit logout cannot be undone by stale WebView credentials', async () => {
  const first = await boot();
  first.auth.getState().setAuth('test-token', user);
  first.auth.getState().logout();
  await first.flush();
  browser.set('pati_token','stale-token'); browser.set('pati_user',JSON.stringify(user));
  const second = await boot();
  await second.auth.getState().restoreSession();
  assert.equal(second.auth.getState().isAuthenticated, false);
  assert.equal(second.auth.getState().token, null);
});

test('first launch after update migrates an existing browser login', async () => {
  browser.set('pati_token','existing'); browser.set('pati_user',JSON.stringify(user));
  const first = await boot();
  await first.auth.getState().restoreSession();
  assert.equal(native.session.token, 'existing');
});

test('native login restores even when WebView storage access throws', async () => {
  native = {present:true,session:{token:'native-token',user}};
  const normalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: () => { throw new Error('storage unavailable'); },
    setItem: () => { throw new Error('storage unavailable'); },
    removeItem: () => { throw new Error('storage unavailable'); },
  };
  try {
    const first = await boot();
    await first.auth.getState().restoreSession();
    assert.equal(first.auth.getState().token, 'native-token');
    assert.equal(first.auth.getState().isAuthenticated, true);
  } finally { globalThis.localStorage = normalStorage; }
});

test('delayed native restore does not undo an explicit logout', async () => {
  let resolve;
  loadOverride = () => new Promise(done => { resolve = done; });
  const first = await boot();
  const restoring = first.auth.getState().restoreSession();
  await new Promise(done => setImmediate(done));
  first.auth.getState().logout();
  resolve({present:true,session:{token:'old-token',user}});
  await restoring;
  assert.equal(first.auth.getState().isAuthenticated, false);
});

test('network failure keeps saved login; revoked credentials clear it', async () => {
  const first = await boot();
  first.auth.getState().setAuth('test-token', user);
  globalThis.fetch = async () => { throw new Error('offline'); };
  await first.auth.getState().fetchMe();
  assert.equal(first.auth.getState().isAuthenticated, true);
  globalThis.fetch = async () => ({ok:false,status:401});
  await first.auth.getState().fetchMe(); await first.flush();
  assert.equal(first.auth.getState().isAuthenticated, false);
  assert.equal(native.session, null);
});
