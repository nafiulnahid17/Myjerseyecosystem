// My Jersey private Artboard gateway for Cloudflare Workers.
// API secrets stay in Worker runtime secrets, never in the static frontend.
const ID = '[A-Za-z0-9_-]{1,100}';
const FILE = '[A-Za-z0-9][A-Za-z0-9._-]{0,127}';
const ALLOWED = [
  ['POST', /^api\/artboard\/projects$/],
  ['GET', new RegExp('^api/artboard/projects/' + ID + '$')],
  ['POST', /^api\/artboard\/upload$/],
  ['POST', /^api\/artboard\/prepare$/],
  ['POST', /^api\/artboard\/recreate$/],
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

// Stateless, signed, per-browser identities; no login form or public token.
const COOKIE_NAME = "mj_visitor";
async function sign(value, secret) {
  const secretBytes = new TextEncoder().encode(secret);
  const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), x => x.toString(16).padStart(2, "0")).join("");
}
async function visitorSession(request, env) {
  // Existing session secret stays authoritative to preserve browser identities.
  // For an Artboard-only setup, derive a separate signing key from the strong
  // server-side engine token using a fixed domain separator. Never expose it.
  let secret = env.MYJERSEY_ACCESS_TOKEN;
  if (typeof secret !== "string" || secret.length < 32) {
    const token = env.ARTBOARD_V031_TOKEN;
    if (typeof token !== "string" || token.length < 32) return null;
    secret = await sign("myjersey/anonymous-session-signing/v1", token);
  }
  const rawCookie = request.headers.get("cookie") || "";
  const found = rawCookie.match(/(?:^|;\s*)mj_visitor=([0-9a-f]{32})\.([0-9a-f]{64})(?:;|$)/);
  if (found && await sign(found[1], secret) === found[2]) {
    return { principal: "guest_" + found[1], setCookie: null };
  }
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), x => x.toString(16).padStart(2,"0")).join("");
  const signature = await sign(id, secret);
  return {
    principal: "guest_" + id,
    setCookie: COOKIE_NAME + "=" + id + "." + signature +
      "; Path=/; Max-Age=1209600; HttpOnly; Secure; SameSite=Lax",
  };
}
function attachSession(response, session) {
  if (!session?.setCookie) return response;
  const headers = new Headers(response.headers);
  headers.set("Set-Cookie", session.setCookie);
  headers.set("Cache-Control", "private, no-store");
  return new Response(response.body, {status: response.status, headers});
}
async function throttle(request, env, route) {
  // Workers Rate Limiting bindings are approximate (per Cloudflare location).
  const ip = request.headers.get("cf-connecting-ip") || "local-test";
  if (!env.API_LIMITER) return json("Cloudflare rate limiting is not configured", 503);
  const overall = await env.API_LIMITER.limit({key: ip});
  if (!overall.success) return json("Too many API requests; retry shortly", 429);
  if (request.method === "POST" && /\/api\/artboard\/production$/.test(route)) {
    if (!env.AI_LIMITER) return json("AI rate protection not configured", 503);
    const paid = await env.AI_LIMITER.limit({key: ip});
    if (!paid.success) return json("AI generation rate limit reached; retry later", 429);
  }
  return null;
}
function engineConfig(env) {
  const origin = artboardOrigin(env);
  const token = env.ARTBOARD_V031_TOKEN;
  // Identity is the signed, unique per-browser principal. A legacy shared
  // principal is neither used nor required in the anonymous Cloudflare flow.
  if (!origin) return { state: 'not_configured', error_code: 'ARTBOARD_URL_INVALID_OR_MISSING' };
  if (typeof token !== 'string' || token.length < 32) return { state: 'not_configured', error_code: 'ARTBOARD_TOKEN_MISSING_OR_SHORT' };
  return { origin, token };
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

async function statusResponse(env, fetchImpl, principal) {
  const engines = { artboard: { state: 'not_configured' }, frame: { state: 'not_configured' },
                    assets: { state: 'not_configured' }, autofly: { state: 'not_configured' } };
  const config = engineConfig(env);
  if (config.state) {
    engines.artboard = { state: config.state, error_code: config.error_code, reachable: false };
  } else {
    try {
      const response = await fetchImpl(config.origin + '/health/ready', {
        headers: { 'Authorization': 'Bearer ' + config.token, 'X-Artboard-User': principal },
        redirect: 'manual',
        signal: AbortSignal.timeout(9000),
      });
      // A structured 503 can carry actionable worker readiness diagnostics.
      // HTTP reachability is distinct from readiness to spend credits.
      const report = await response.json().catch(() => null);
      const rawCode = report?.error?.code;
      const safeCodes = new Set([
        'ARTBOARD_WORKER_NOT_CONFIGURED', 'ARTBOARD_WORKER_UNREACHABLE',
        'ARTBOARD_WORKER_REDIRECT', 'ENGINE_AUTH_NOT_CONFIGURED',
        'UNAUTHORIZED', 'DURABLE_JOB_WORKER_REQUIRED', 'IDENTITY_REQUIRED',
      ]);
      const recognized = report?.engine === 'Artboard AI' ||
        safeCodes.has(rawCode) || (response.ok && report?.status === 'ready');
      const ready = response.ok && recognized && report?.status === 'ready';
      const checks = { ...report?.segments?.engine?.checks, ...report?.segments?.tool?.checks };
      const safeChecks = new Set(['engine_initialized','opencv','renderer','vector_validator',
        'vector_render','storage','gateway_auth','queue','vector_conversion',
        'ai_artwork_generation','durable_storage','durable_job_execution','r2_remote_read_write']);
      const failedChecks = Object.keys(checks).filter(k => safeChecks.has(k) && checks[k] === false);
      const boolOrNull = v => typeof v === 'boolean' ? v : null;
      engines.artboard = {
        state: ready ? 'online' : 'not_ready',
        reachable: recognized,
        http_status: response.status,
        error_code: ready ? null : safeCodes.has(rawCode) ? rawCode :
          response.status === 401 || response.status === 403 ? 'ENGINE_AUTH_REJECTED' :
          recognized ? 'ENGINE_NOT_READY' : 'UNRECOGNIZED_ENGINE_RESPONSE',
        failed_checks: failedChecks,
        ai_configured: boolOrNull(report?.ai_configured),
        primary_ai_ready: boolOrNull(report?.primary_ai_ready),
        fallback_ai_ready: boolOrNull(report?.fallback_ai_ready),
        export_engine_ready: boolOrNull(report?.export_engine_ready),
      };
    } catch {
      engines.artboard = { state: 'unreachable', reachable: false, error_code: 'ENGINE_NETWORK_OR_TIMEOUT' };
    }
  }
  return new Response(JSON.stringify({ engines, source: 'live_health_requests' }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
  });
}

async function artboardProxy(request, env, fetchImpl, pathname, search, principal) {
  const path = pathname.slice('/api/engine/artboard/'.length);
  if (!ALLOWED.some(([method, matcher]) => method === request.method && matcher.test(path))) {
    return json('Unsupported engine operation', 404);
  }
  const config = engineConfig(env);
  if (config.state) return json(config.error_code, 503);
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
    const headers = upstreamHeaders(request, { ...config, principal });
    for (const [key, value] of headers) upstreamRequest.headers.set(key, value);
    for (const key of ['x-workspace-key', 'cookie', 'origin', 'referer']) upstreamRequest.headers.delete(key);
    let response = await fetchImpl(upstreamRequest, { redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) {
      // Only ownership-checked artifact redirects to a private, signed R2 URL.
      // Fetch without engine bearer, visitor identity, cookies or user headers.
      if(response.status!==307||request.method!=='GET'||!path.includes('/artifacts/'))return json('Unexpected engine redirect',502);
      let signed;try{signed=new URL(response.headers.get('location'));}catch{return json('Invalid artifact redirect',502);}
      if(signed.protocol!=='https:'||signed.username||signed.password||signed.port||
         !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.r2\.cloudflarestorage\.com$/i.test(signed.hostname)||
         !signed.searchParams.has('X-Amz-Signature')||!signed.searchParams.has('X-Amz-Credential')||
         !signed.searchParams.has('X-Amz-Expires')||Number(signed.searchParams.get('X-Amz-Expires'))>600)
        return json('Unexpected engine redirect',502);
      response=await fetchImpl(new Request(signed.href,{method:'GET'}),{redirect:'manual'});
      if(response.status>=300&&response.status<400)return json('Unexpected R2 redirect',502);
    }
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('set-cookie');
    responseHeaders.set('Cache-Control', 'private, no-store');
    responseHeaders.set('X-Content-Type-Options', 'nosniff');
    if(path.includes('/artifacts/'))responseHeaders.set('Content-Security-Policy',"default-src 'none'; sandbox");
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch {
    return json('Artboard engine unreachable', 502);
  }
}

export async function handleRequest(request, env, fetchImpl = fetch) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
  if (!["GET","POST"].includes(request.method)) return json("Method not allowed", 405);

  // Disallow cross-origin browser writes; API remains publicly accessible
  // from this Cloudflare frontend during testing without a manual login.
  const origin = request.headers.get("origin");
  if (request.method === "POST" && origin && origin !== url.origin) {
    return json("Cross-origin API submissions are not accepted", 403);
  }
  const limit = await throttle(request, env, url.pathname);
  if (limit) return limit;
  const visitor = await visitorSession(request, env);
  if (!visitor) return json("Configure ARTBOARD_V031_TOKEN (32+ characters) or MYJERSEY_ACCESS_TOKEN for browser session signing", 503);
  if (request.method === "GET" && url.pathname === "/api/status")
    return attachSession(await statusResponse(env, fetchImpl, visitor.principal), visitor);
  if (url.pathname.startsWith("/api/engine/artboard/"))
    return attachSession(
      await artboardProxy(request, env, fetchImpl, url.pathname, url.search, visitor.principal),
      visitor
    );
  return attachSession(json("Unsupported engine operation", 404), visitor);
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  }
};
