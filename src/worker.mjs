// My Jersey private Artboard gateway for Cloudflare Workers.
// API secrets stay in Worker runtime secrets, never in the static frontend.
const ID = '[A-Za-z0-9_-]{1,100}';
const FILE = '[A-Za-z0-9][A-Za-z0-9._-]{0,127}';
const ALLOWED = [
  ['POST', /^api\/artboard\/projects$/],
  ['GET', new RegExp('^api/artboard/projects/' + ID + '$')],
  ['POST', /^api\/artboard\/upload$/],
  ['POST', /^api\/artboard\/prepare$/],
  ['POST', /^api\/artboard\/production$/],
  ['POST', /^api\/artboard\/export$/],
  ['GET', new RegExp('^api/artboard/jobs/' + ID + '$')],
  ['POST', new RegExp('^api/artboard/jobs/' + ID + '/cancel$')],
  ['GET', new RegExp('^api/artboard/projects/' + ID + '/artifacts/(?:' + FILE + '/)*' + FILE + '$')],
];

const json = (detail, status) => new Response(JSON.stringify({ detail }), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});

function artboardOrigin(env) {
  try {
    const url = new URL((env.ARTBOARD_V031_URL || '').trim());
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password ||
        (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function identityValid(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_:.@-]{1,128}$/.test(value);
}

async function secretMatches(input, expected) {
  if (typeof expected !== 'string' || expected.length < 32 || !input) return false;
  // Compare fixed-length digests to avoid prefix/length timing differences.
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(input)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected))
  ]);
  const left = new Uint8Array(a), right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

function engineConfig(env) {
  const origin = artboardOrigin(env);
  const token = env.ARTBOARD_V031_TOKEN;
  const principal = env.MYJERSEY_ARTBOARD_PRINCIPAL;
  if (!origin || typeof token !== 'string' || token.length < 32) return { state: 'not_configured' };
  if (!identityValid(principal)) return { state: 'missing_identity' };
  return { origin, token, principal };
}

function upstreamHeaders(request, config) {
  const headers = new Headers(request.headers);
  for (const key of ['x-workspace-key', 'authorization', 'cookie', 'host', 'origin', 'referer', 'x-artboard-user', 'x-revector-user']) {
    headers.delete(key);
  }
  headers.set('Authorization', 'Bearer ' + config.token);
  headers.set('X-Artboard-User', config.principal);
  return headers;
}

async function statusResponse(env, fetchImpl) {
  const engines = { artboard: { state: 'not_configured' }, frame: { state: 'not_configured' },
                    assets: { state: 'not_configured' }, autofly: { state: 'not_configured' } };
  const config = engineConfig(env);
  if (config.state) {
    engines.artboard = { state: config.state };
  } else {
    try {
      const response = await fetchImpl(config.origin + '/health/ready', {
        headers: { 'Authorization': 'Bearer ' + config.token, 'X-Artboard-User': config.principal },
        redirect: 'manual',
        signal: AbortSignal.timeout(9000),
      });
      if (response.ok) {
        const report = await response.json();
        engines.artboard = { state: report && report.status === 'ready' ? 'online' : 'not_ready' };
      } else {
        engines.artboard = { state: 'not_ready', http_status: response.status };
      }
    } catch {
      engines.artboard = { state: 'unreachable' };
    }
  }
  return new Response(JSON.stringify({ engines, source: 'live_health_requests' }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
  });
}

async function artboardProxy(request, env, fetchImpl, pathname, search) {
  const path = pathname.slice('/api/engine/artboard/'.length);
  if (!ALLOWED.some(([method, matcher]) => method === request.method && matcher.test(path))) {
    return json('Unsupported engine operation', 404);
  }
  const config = engineConfig(env);
  if (config.state) return json(config.state === 'missing_identity' ? 'Artboard identity is missing' : 'Artboard engine is not configured', 503);
  if (request.method === 'POST') {
    const type = request.headers.get('content-type') || '';
    if (!(type.startsWith('application/json') || type.startsWith('multipart/form-data;'))) {
      return json('JSON or multipart data required', 415);
    }
    const length = Number(request.headers.get('content-length') || '0');
    if (length > 52 * 1024 * 1024) return json('Maximum request size exceeded', 413);
  }
  const target = config.origin + '/' + path + search;
  try {
    const upstreamRequest = new Request(target, request);
    const headers = upstreamHeaders(request, config);
    for (const [key, value] of headers) upstreamRequest.headers.set(key, value);
    for (const key of ['x-workspace-key', 'cookie', 'origin', 'referer']) upstreamRequest.headers.delete(key);
    const response = await fetchImpl(upstreamRequest, { redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) return json('Unexpected engine redirect', 502);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('set-cookie');
    responseHeaders.set('Cache-Control', 'private, no-store');
    responseHeaders.set('X-Content-Type-Options', 'nosniff');
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch {
    return json('Artboard engine unreachable', 502);
  }
}

export async function handleRequest(request, env, fetchImpl = fetch) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
  if (!env.MYJERSEY_ACCESS_TOKEN || env.MYJERSEY_ACCESS_TOKEN.length < 32) {
    return json('Workspace gateway authentication is not configured', 503);
  }
  if (!(await secretMatches(request.headers.get('x-workspace-key'), env.MYJERSEY_ACCESS_TOKEN))) {
    return json('Workspace authentication required', 401);
  }
  if (request.method === 'GET' && url.pathname === '/api/status') return statusResponse(env, fetchImpl);
  if (url.pathname.startsWith('/api/engine/artboard/')) {
    return artboardProxy(request, env, fetchImpl, url.pathname, url.search);
  }
  return json('Unsupported engine operation', 404);
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  }
};
