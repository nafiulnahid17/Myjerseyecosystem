import assert from 'node:assert/strict';
import test from 'node:test';
import { handleRequest } from '../src/worker.mjs';

const origin = 'https://myjerseyecosystem.atheriouslabs.workers.dev';
const id = '76afb400-33ca-49ed-ac22-2b0ce9aa0132';
const limiter = { limit: async () => ({ success: true }) };
const env = {
  API_LIMITER: limiter,
  AI_LIMITER: limiter,
  ASSETS: { fetch: async req => new Response(new URL(req.url ?? req).pathname) },
};
const request = (path, init) => new Request(origin + path, init);

test('the ecosystem and Studio documents resolve', async () => {
  assert.equal(await (await handleRequest(request('/'), env)).text(), '/');
  for (const link of ['/production-studio', '/artboard', '/artboard-ai']) {
    const response = await handleRequest(request(link), env);
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('location'), origin + '/production-studio/');
  }
  for (const route of ['/production-studio/', '/production-studio/production/' + id, '/production-studio/export/' + id]) {
    assert.equal(await (await handleRequest(request(route), env)).text(), '/production-studio/');
  }
});

test('unconfigured Studio shows a pending workspace and prevents job submission', async () => {
  const status = await handleRequest(request('/api/studio/workspace'), env);
  assert.deepEqual(await status.json(), {
    available: false, setupPending: true, signedIn: false, deviceWorkspace: false, email: null,
  });
  const jobs = await handleRequest(request('/api/studio/jobs', { method: 'POST', headers: { origin } }), env);
  assert.equal(jobs.status, 503);
  const health = await (await handleRequest(request('/api/status'), env)).json();
  assert.equal(health.source, 'live_health_requests');
  assert.deepEqual(Object.keys(health.engines), ['studio', 'frame', 'assets', 'autofly']);
  assert.equal(health.engines.studio.state, 'not_configured');
});

test('configured Studio receives the original origin, authorization assertion and request body', async () => {
  const ready = { ...env, DB: {}, BUCKET: {}, PRODUCTION: {} };
  const visited = [];
  const studio = {
    async fetch(req) {
      visited.push(req.url);
      assert.equal(req.headers.get('cf-access-jwt-assertion'), 'test-assertion');
      if (req.method === 'POST') {
        assert.equal(req.headers.get('origin'), origin);
        assert.equal(req.headers.get('idempotency-key'), id);
        assert.equal(await req.text(), 'reference');
      }
      return Response.json({ available: true, signedIn: true });
    },
  };
  const headers = { origin, 'cf-access-jwt-assertion': 'test-assertion', 'idempotency-key': id };
  await handleRequest(request('/api/studio/jobs', { method: 'POST', headers, body: 'reference' }), ready, studio);
  await handleRequest(request('/api/studio/jobs/' + id + '/files/master.zip', { headers }), ready, studio);
  await handleRequest(request('/api/status', { headers }), ready, studio);
  assert.deepEqual(visited, [
    origin + '/api/jobs', origin + '/api/jobs/' + id + '/files/master.zip', origin + '/api/workspace',
  ]);
});

test('private runtime, retired Artboard endpoints and unrelated operations stay inaccessible', async () => {
  for (const path of ['/_pipeline/launch.py', '/_pipeline/manifest.json',
    '/api/engine/artboard/api/artboard/projects', '/api/studio/engine/key', '/api/unknown']) {
    assert.equal((await handleRequest(request(path), env)).status, 404, path);
  }
});

test('the gateway rejects cross-origin writes and limits paid submissions', async () => {
  const ready = { ...env, DB: {}, BUCKET: {}, PRODUCTION: {} };
  const studio = { fetch: async () => assert.fail('Should not reach production') };
  for (const source of ['https://untrusted.test', '']) {
    assert.equal((await handleRequest(request('/api/studio/jobs', {
      method: 'POST', headers: { origin: source },
    }), ready, studio)).status, 403);
  }
  const blocked = { ...ready, AI_LIMITER: { limit: async () => ({ success: false }) } };
  const post = request('/api/studio/jobs', { method: 'POST', headers: { origin } });
  assert.equal((await handleRequest(post, blocked, studio)).status, 429);
  assert.equal((await handleRequest(post, { ...ready, AI_LIMITER: undefined }, studio)).status, 503);
});
