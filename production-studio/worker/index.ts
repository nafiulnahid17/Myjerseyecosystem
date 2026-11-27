import type { JobRow, Env } from "./bindings";
import { prefix } from "./bindings";
import { identity } from "./auth";
import { dimensions, INPUT_LIMIT, sha256 } from "./images";
import { detail, jobRow, record, toJob } from "./jobs";
import { approvedArtworkPrompt, runtimeManifest } from "./openai";

export { JerseyProduction } from "./workflow";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const downloads: Partial<Record<string, string>> = {
  "FRONT_BODY.eps": "FRONT_BODY.eps",
  "BACK_BODY.eps": "BACK_BODY.eps",
  "master.zip": "MY_JERSEY_MASTER.zip",
};
const previews = ["front-proof.jpg", "back-proof.jpg"];
const masters = ["front-master.png", "back-master.png"];
const noStore = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
};
const json = (object: unknown, status = 200) => Response.json(object, { status, headers: noStore });
const error = (message: string, code: number) => json({ error: message }, code);

async function createJob(request: Request, env: Env, owner: string) {
  const origin = request.headers.get("Origin");
  if (origin !== new URL(request.url).origin || request.headers.get("Sec-Fetch-Site") === "cross-site") return error("Use the production workspace to start a job.", 403);
  if (!env.OPENAI_API_KEY?.trim()) return error("Production connection pending.", 503);
  try { await Promise.all([runtimeManifest(env), approvedArtworkPrompt(env)]); }
  catch { return error("Production setup is incomplete.", 503); }

  const id = request.headers.get("Idempotency-Key")?.toLowerCase() ?? "";
  if (!uuid.test(id)) return error("The production request is missing a valid job ID.", 400);
  const length = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(length) && length > INPUT_LIMIT + 48_000) return error("Reference images must be 10 MB or smaller.", 413);
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.startsWith("multipart/form-data;")) return error("Upload a reference image to continue.", 415);
  let form: FormData;
  try { form = await request.formData(); }
  catch { return error("The reference upload could not be read.", 400); }
  const reference = form.get("reference");
  const mode = form.get("mode");
  if (!(reference instanceof File) || !reference.size || reference.size > INPUT_LIMIT) {
    return error("Choose a JPG, PNG or WebP image up to 10 MB.", 400);
  }
  if (mode !== "standard" && mode !== "fast") return error("Choose Standard or Fast production mode.", 400);
  const bytes = new Uint8Array(await reference.arrayBuffer());
  const image = dimensions(bytes);
  if (!image || image.width < 32 || image.height < 32 || image.width * image.height > 49_000_000) {
    return error("Choose a usable JPG, PNG or WebP image between 32 px per side and 49 megapixels.", 400);
  }

  const referenceHash = await sha256(bytes);
  const name = reference.name.replace(/[\\/\u0000-\u001f\u007f]/g, " ").trim().slice(0, 160) || "Jersey reference";
  const now = Date.now();
  const ins = await env.DB.prepare(
    "INSERT INTO jobs (id, owner, name, source_type, source_hash, mode, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?) ON CONFLICT(id) DO NOTHING"
  ).bind(id, owner, name, image.type, referenceHash, mode, now, now).run();

  if (!ins.meta.changes) {
    const existing = await jobRow(env, id);
    if (!existing || existing.owner !== owner || existing.source_hash !== referenceHash || existing.mode !== mode) {
      return error("That production request ID is already in use.", 409);
    }
    return json(await detail(env, existing), 200);
  }

  try {
    await env.BUCKET.put(prefix(id) + "reference", bytes, {
      onlyIf: { etagDoesNotMatch: "*" },
      customMetadata: { sha256: referenceHash },
      httpMetadata: { contentType: image.type },
    });
    await env.PRODUCTION.create({ id, params: { id } });
  } catch (cause) {
    // An uncertain create must never enqueue a second provider job.
    try {
      const active = await (await env.PRODUCTION.get(id)).status();
      if (!active || active.status === "unknown") throw cause;
    } catch {
      await record(env, id, 1, "failed", "The production workspace could not queue this request.");
    }
  }
  const row = await jobRow(env, id);
  return row ? json(await detail(env, row), 202) : error("The production job could not be retrieved.", 500);
}

async function download(env: Env, row: JobRow, file: string) {
  const locked = masters.includes(file) && (file.startsWith("front") ? row.front_ready : row.back_ready);
  const exportable = row.status === "complete" && (Object.hasOwn(downloads, file) || previews.includes(file));
  if (!locked && !exportable) return error("This production file is not available.", 404);
  const stored = await env.BUCKET.get(prefix(row.id) + file);
  if (!stored) return error("This production file is not available.", 404);
  const headers = new Headers(noStore);
  stored.writeHttpMetadata(headers);
  headers.set("Content-Length", String(stored.size));
  if (Object.hasOwn(downloads, file)) headers.set("Content-Disposition", 'attachment; filename="' + downloads[file] + '"');
  return new Response(stored.body, { headers });
}

async function api(request: Request, env: Env, url: URL) {
  const user = await identity(request, env);
  if (request.method === "GET" && url.pathname === "/api/workspace") {
    // This checks configuration only. Provider access starts with a real job.
    const configured = !!env.OPENAI_API_KEY?.trim() && !!env.STUDIO_ARTWORK_PROMPT?.trim() && (!!user?.local || (!!env.CF_ACCESS_TEAM_DOMAIN && !!env.CF_ACCESS_AUD));
    const available = !!user && configured && await Promise.all([runtimeManifest(env), approvedArtworkPrompt(env)]).then(() => true, () => false);
    return json({ available, setupPending: !configured || (!!user && !available),
                  signedIn: !!user, deviceWorkspace: user?.local ?? false, email: user?.email ?? null });
  }
  if (!user) return error("Sign in to your production workspace.", 401);
  if (url.pathname === "/api/jobs") {
    if (request.method === "POST") return createJob(request, env, user.owner);
    if (request.method === "GET") {
      const { results } = await env.DB.prepare("SELECT * FROM jobs WHERE owner = ? ORDER BY created_at DESC LIMIT 60").bind(user.owner).all<JobRow>();
      return json(results.map(row => toJob(row)));
    }
    return error("Method unavailable.", 405);
  }
  const match = /^\/api\/jobs\/([\w-]+)(?:\/files\/([\w.-]+))?$/.exec(url.pathname);
  if (request.method !== "GET" || !match || !uuid.test(match[1])) return error("Resource unavailable.", 404);
  const row = await jobRow(env, match[1]);
  if (!row || row.owner !== user.owner) return error("This production job is not available.", 404);
  if (match[2]) return download(env, row, match[2]);
  return json(await detail(env, row));
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === "/_pipeline" || url.pathname.startsWith("/_pipeline/")) return new Response(null, { status: 404 });
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      return await api(request, env, url);
    } catch (cause) {
      console.error("Workspace request failed", cause instanceof Error ? cause.name : "unknown");
      return error("The production workspace could not complete this request.", 500);
    }
  },
} satisfies ExportedHandler<Env>;
