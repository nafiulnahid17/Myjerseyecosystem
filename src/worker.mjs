// The ecosystem serves the Studio UI and routes authenticated Studio jobs.
const STUDIO = '/production-studio';
const API = '/api/studio';
const jobId = '[0-9a-f-]{36}';
const page = new RegExp('^' + STUDIO + '/(?:production|export)/' + jobId + '$', 'i');
const job = new RegExp('^' + API + '/jobs/' + jobId + '(?:/files/[\\w.-]+)?$', 'i');
const pending = { available: false, setupPending: true, signedIn: false, deviceWorkspace: false, email: null };

function json(body, status = 200) {
  return Response.json(body, { status, headers: {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  } });
}

async function studioRequest(request, url, env, studio) {
  const workspace = url.pathname === API + '/workspace' && request.method === 'GET';
  const jobs = url.pathname === API + '/jobs';
  if (!workspace && !jobs && !(request.method === 'GET' && job.test(url.pathname))) {
    return json({ error: 'Studio route not found.' }, 404);
  }
  if (!studio || !env.DB || !env.BUCKET || !env.PRODUCTION) {
    if (workspace) return json(pending);
    return json({ error: 'Production connection pending.' }, 503);
  }
  if (request.method === 'POST' && jobs) {
    const outcome = await env.AI_LIMITER?.limit({ key: request.headers.get('cf-connecting-ip') || 'local-test' });
    if (!outcome) return json({ error: 'Production rate limiting is not configured.' }, 503);
    if (!outcome.success) return json({ error: 'Production rate limit reached. Retry shortly.' }, 429);
  }
  const target = new URL(url);
  target.pathname = '/api' + url.pathname.slice(API.length);
  return studio.fetch(new Request(target, request), env);
}

async function statusResponse(request, env, studio) {
  const engines = {
    studio: { state: 'not_configured', reachable: false },
    frame: { state: 'not_configured' },
    assets: { state: 'not_configured' },
    autofly: { state: 'not_configured' },
  };
  if (studio && env.DB && env.BUCKET && env.PRODUCTION) {
    try {
      const target = new URL('/api/workspace', request.url);
      const status = await studio.fetch(new Request(target, request), env);
      if (status.ok) {
        const workspace = await status.json();
        engines.studio = {
          state: workspace.available ? 'online' : workspace.setupPending ? 'not_configured' : 'not_ready',
          reachable: true,
        };
      } else engines.studio = { state: 'not_ready', reachable: true };
    } catch {
      engines.studio = { state: 'unreachable', reachable: false };
    }
  }
  return json({ engines, source: 'live_health_requests' });
}

export async function handleRequest(request, env, studio) {
  const url = new URL(request.url);
  const { pathname } = url;
  if (pathname === '/_pipeline' || pathname.startsWith('/_pipeline/')) return new Response(null, { status: 404 });
  if (pathname === STUDIO || pathname === '/artboard' || pathname === '/artboard-ai') {
    return Response.redirect(new URL(STUDIO + '/', url), 308);
  }
  if (page.test(pathname)) {
    const entry = new URL(STUDIO + '/', url);
    return env.ASSETS.fetch(new Request(entry, request));
  }
  if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

  if (!['GET', 'POST'].includes(request.method)) return json({ detail: 'Method not allowed' }, 405);
  if (request.method === 'POST' && request.headers.get('origin') !== url.origin) {
    return json({ error: 'Cross-origin API submissions are not accepted.' }, 403);
  }

  if (!env.API_LIMITER) return json({ detail: 'Cloudflare rate limiting is not configured' }, 503);
  const result = await env.API_LIMITER.limit({ key: request.headers.get('cf-connecting-ip') || 'local-test' });
  if (!result.success) return json({ detail: 'Too many API requests. Retry shortly.' }, 429);

  if (pathname === API || pathname.startsWith(API + '/')) return studioRequest(request, url, env, studio);
  if (pathname === '/api/status' && request.method === 'GET') return statusResponse(request, env, studio);
  return json({ detail: 'Unsupported engine operation' }, 404);
}
