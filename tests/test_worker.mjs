import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../src/worker.mjs';

const BASE = 'https://myjersey.example';
const ORIGIN = 'https://artboard-ai-resolution-independent-production.up.railway.app';
const WORKSPACE = 'w'.repeat(64);
const ENGINE = 'e'.repeat(64);
const env = () => ({
  MYJERSEY_ACCESS_TOKEN: WORKSPACE,
  ARTBOARD_V031_URL: ORIGIN,
  ARTBOARD_V031_TOKEN: ENGINE,
  MYJERSEY_ARTBOARD_PRINCIPAL: 'private-operator',
  ASSETS: { fetch: async () => new Response('STATIC') },
});
const request = (path, key = WORKSPACE, options = {}) => new Request(BASE + path, {
  ...options, headers: { 'X-Workspace-Key': key, ...(options.headers || {}) }
});

test('unchanged static UI stays served via ASSETS binding', async () => {
  const r = await handleRequest(request('/'), env());
  assert.equal(await r.text(), 'STATIC');
});

test('API fails closed when no secret is configured or the key is wrong', async () => {
  const e = env(); delete e.MYJERSEY_ACCESS_TOKEN;
  assert.equal((await handleRequest(request('/api/status'), e)).status, 503);
  assert.equal((await handleRequest(request('/api/status', 'not-authorized'), env())).status, 401);
});

test('status uses the actual authenticated Artboard readiness response', async () => {
  const seen = [];
  const upstream = async (url, options) => {
    seen.push([url, options.headers.Authorization, options.headers['X-Artboard-User']]);
    return Response.json({ status: 'ready' });
  };
  const response = await handleRequest(request('/api/status'), env(), upstream);
  assert.equal(response.status, 200);
  const status = await response.json();
  assert.equal(status.source, 'live_health_requests');
  assert.equal(status.engines.artboard.state, 'online');
  assert.equal(status.engines.frame.state, 'not_configured');
  assert.deepEqual(seen[0], [ORIGIN + '/health/ready', 'Bearer ' + ENGINE, 'private-operator']);
});

test('unconfigured Artboard is not fabricated online', async () => {
  const e = env(); delete e.ARTBOARD_V031_TOKEN;
  const response = await handleRequest(request('/api/status'), e);
  assert.equal((await response.json()).engines.artboard.state, 'not_configured');
});

test('Artboard project creation forwards authenticated API without exposing workspace key', async () => {
  const upstream = async (incoming) => {
    assert.equal(incoming.url, ORIGIN + '/api/artboard/projects');
    assert.equal(incoming.method, 'POST');
    assert.equal(incoming.headers.get('authorization'), 'Bearer ' + ENGINE);
    assert.equal(incoming.headers.get('x-artboard-user'), 'private-operator');
    assert.equal(incoming.headers.has('x-workspace-key'), false);
    assert.deepEqual(await incoming.json(), { name: 'test', processing_mode: 'cost_effective' });
    return Response.json({ project_id: 'project-123' }, { status: 201 });
  };
  const response = await handleRequest(request('/api/engine/artboard/api/artboard/projects', WORKSPACE, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'test', processing_mode: 'cost_effective' })
  }), env(), upstream);
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { project_id: 'project-123' });
});

test('only allowlisted Artboard routes work; other engines stay disconnected', async () => {
  const reject = async () => { throw Error('must not call upstream'); };
  assert.equal((await handleRequest(request('/api/engine/frame/api/frameforge/templates'), env(), reject)).status, 404);
  assert.equal((await handleRequest(request('/api/engine/artboard/api/artboard/admin'), env(), reject)).status, 404);
  assert.equal((await handleRequest(request('/api/engine/artboard/api/artboard/projects', WORKSPACE, { method: 'DELETE' }), env(), reject)).status, 404);
});

test('reject unexpected redirect to protect engine Authorization header', async () => {
  const response = await handleRequest(request('/api/engine/artboard/api/artboard/projects/abc'), env(), async () => new Response(null, { status: 302, headers: { Location: 'https://unexpected.example/' } }));
  assert.equal(response.status, 502);
});

test('Wrangler compatibility date is not in the future in UTC', async () => {
  const { readFileSync } = await import('node:fs');
  const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.ok(config.compatibility_date <= new Date().toISOString().slice(0, 10),
    'Cloudflare rejects future compatibility dates when local and UTC dates differ');
});
