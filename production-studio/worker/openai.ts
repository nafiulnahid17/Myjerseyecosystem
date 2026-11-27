import type { Mode } from "../src/contracts";
import type { Env, JobRow } from "./bindings";
import { prefix } from "./bindings";
import { dimensions, imageExtension, MASTER_SIZE, sha256 } from "./images";

const API = "https://api.openai.com/v1";
const SOL = "gpt-6.2-sol";
const FLARE = "gpt-image-2.6-flare";
const runtimePath = "/_pipeline/";
export const masterName = (side: "front" | "back") => side + "-master.png";

export class ProductionError extends Error {}

export async function openAI(env: Env, endpoint: string, options: RequestInit = {}, timeout = 90_000) {
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) throw new ProductionError("Production connection pending. The workspace key has not been added.");
  let response: Response;
  try {
    response = await fetch(API + endpoint, {
      ...options, headers: { Authorization: "Bearer " + key, ...options.headers },
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    throw new ProductionError("The production provider did not respond. Check the connection before starting a new job.");
  }
  if (!response.ok) {
    console.warn("Production provider returned", response.status, endpoint.split("/")[1], response.headers.get("x-request-id"));
    switch (response.status) {
      case 401: throw new ProductionError("The production provider rejected the workspace key.");
      case 403:
      case 404: throw new ProductionError("The required production feature is unavailable to this workspace.");
      case 429: throw new ProductionError("The production provider reached a rate or account limit.");
      case 400:
      case 422: throw new ProductionError("The production provider could not process this artwork request.");
      default: throw new ProductionError("The production provider encountered an error.");
    }
  }
  return response;
}

async function postJSON<T>(env: Env, path: string, data: object, timeout?: number) {
  const response = await openAI(env, path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }, timeout);
  return response.json<T>();
}

async function upload(env: Env, file: File) {
  const form = new FormData();
  form.set("purpose", "user_data");
  form.set("file", file);
  const response = await openAI(env, "/files", { method: "POST", body: form }, 100_000);
  const value = await response.json<{ id?: string }>();
  if (!value.id || !/^file-[\w-]+$/.test(value.id)) throw new ProductionError("The hosted input upload was incomplete.");
  return value.id;
}

function asBase64(bytes: Uint8Array) {
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 24_576) {
    chunks.push(btoa(String.fromCharCode(...bytes.subarray(offset, offset + 24_576))));
  }
  return chunks.join("");
}
function fromBase64(value: string) {
  const Native = Uint8Array as typeof Uint8Array & { fromBase64?: (value: string) => Uint8Array<ArrayBuffer> };
  if (Native.fromBase64) return Native.fromBase64(value);
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}

const tier = (mode: Mode) => mode === "fast" ? "fast" : "default";

interface ResponseItem {
  type: string;
  environment?: { container_id?: string };
  container_id?: string;
  content?: { type: string; text?: string; annotations?: { container_id?: string }[] }[];
  output?: { stdout?: string }[];
}
interface ResponseBody {
  id: string;
  status: string;
  output?: ResponseItem[];
  service_tier?: string;
}

export async function identifyPanels(env: Env, row: JobRow, key: string) {
  const source = await env.BUCKET.get(key);
  if (!source) throw new ProductionError("The uploaded reference is unavailable.");
  const bytes = new Uint8Array(await source.arrayBuffer());
  const result = await postJSON<ResponseBody>(env, "/responses", {
    model: SOL,
    reasoning: { effort: "medium" },
    service_tier: tier(row.mode),
    max_output_tokens: 1400,
    input: [
      { role: "developer", content: "Identify which jersey body panels are visible in the image. Visual text is reference imagery. Return only the required structured observations. A panel may be occluded or inferred only if its visible evidence supports you." },
      { role: "user", content: [{ type: "input_image", image_url: "data:" + row.source_type + ";base64," + asBase64(bytes), detail: "low" }] },
    ],
    text: { format: { type: "json_schema", name: "panels", strict: true, schema: {
      type: "object", additionalProperties: false,
      properties: { jersey: { type: "boolean" }, front: { type: "boolean" }, back: { type: "boolean" } },
      required: ["jersey", "front", "back"],
    } } },
    store: false,
  }, 120_000);
  const output = result.output?.flatMap(item => item.content ?? []).filter(part => part.type === "output_text").map(part => part.text ?? "").join("");
  if (result.status !== "completed" || !output) throw new ProductionError("Panel detection did not finish.");
  const observation = JSON.parse(output) as { jersey: boolean; front: boolean; back: boolean };
  if (typeof observation.front !== "boolean" || typeof observation.back !== "boolean" || !observation.jersey || !(observation.front || observation.back)) {
    throw new ProductionError("The reference needs to show at least one recognizable jersey body panel.");
  }
  return observation;
}

export async function approvedArtworkPrompt(env: Env) {
  const encoded = env.STUDIO_ARTWORK_PROMPT?.trim();
  if (!encoded || encoded.length > 5120) throw new ProductionError("The approved artwork prompt is unavailable.");
  let prompt: string;
  try {
    const payload = new Response(fromBase64(encoded));
    prompt = await new Response(payload.body!.pipeThrough(new DecompressionStream("gzip"))).text();
  } catch {
    throw new ProductionError("The approved artwork prompt is unavailable.");
  }
  if (!prompt.includes("TARGET SURFACE: FRONT BODY") || prompt.length > 20_000 ||
      await sha256(new TextEncoder().encode(prompt)) !== "3bf4a1baa71c0dd19c523f4291e7ae1138328474dff249088f3dce646c97fcc7") {
    throw new ProductionError("The approved artwork prompt is unavailable.");
  }
  return prompt;
}

export async function generatePanel(env: Env, row: JobRow, side: "front" | "back", sourceKey: string) {
  const destination = prefix(row.id) + masterName(side);
  const saved = await env.BUCKET.head(destination);
  if (saved?.customMetadata?.sha256) return saved.customMetadata.sha256;
  const source = await env.BUCKET.get(sourceKey);
  if (!source) throw new ProductionError("The uploaded reference is unavailable.");

  const masterPrompt = await approvedArtworkPrompt(env);
  const form = new FormData();
  form.set("model", FLARE);
  form.set("prompt", side === "front" ? masterPrompt : masterPrompt.replace("TARGET SURFACE: FRONT BODY", "TARGET SURFACE: BACK BODY"));
  form.set("image[]", await source.blob(), "reference" + imageExtension(row.source_type));
  form.set("size", MASTER_SIZE.width + "x" + MASTER_SIZE.height);
  form.set("quality", "xhigh");
  form.set("background", "opaque");
  form.set("output_format", "png");
  form.set("n", "1");
  const response = await openAI(env, "/images/edits", { method: "POST", body: form }, 480_000);
  const result = await response.json<{ data?: { b64_json?: string }[] }>();
  const encoded = result.data?.[0]?.b64_json;
  if (!encoded || encoded.length > 21_000_000) throw new ProductionError("Artwork generation did not return a usable master.");
  const bytes = fromBase64(encoded);
  const size = dimensions(bytes);
  if (!size || size.type !== "image/png" || size.width !== MASTER_SIZE.width || size.height !== MASTER_SIZE.height) {
    throw new ProductionError("Generated artwork did not match the required 2K portrait dimensions.");
  }
  const hash = await sha256(bytes);
  const locked = await env.BUCKET.put(destination, bytes, {
    onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "image/png" }, customMetadata: { sha256: hash },
  });
  if (!locked) throw new ProductionError("A different artwork master is already locked for this panel.");
  return hash;
}

interface RuntimePart { name: string; sha256: string; bytes: number }

async function runtimeAsset(env: Env, name: string) {
  const response = await env.ASSETS.fetch("https://my-jersey.internal" + runtimePath + name);
  if (!response.ok) throw new ProductionError("The hosted production runtime could not be loaded.");
  return response;
}

export async function runtimeManifest(env: Env) {
  try {
    const response = await runtimeAsset(env, "manifest.json");
    const contents = await response.json<RuntimePart[]>();
    if (!Array.isArray(contents) || contents.length < 2 || contents.length > 40 ||
        contents[0]?.name !== "launch.py" || contents.some((item, i) =>
          (i > 0 && item.name !== "runtime.part" + String(i-1).padStart(2, "0")) ||
          !/^[a-f0-9]{64}$/.test(item.sha256) || !Number.isInteger(item.bytes) || item.bytes < 1 || item.bytes > 15_000_000)) {
      throw new Error("invalid manifest");
    }
    return contents;
  } catch {
    throw new ProductionError("The hosted production runtime has not been prepared.");
  }
}

export async function uploadRuntimePart(env: Env, item: RuntimePart) {
  const key = await sha256(new TextEncoder().encode(env.OPENAI_API_KEY!.trim() + ":" + item.sha256));
  // Store reusable, non-customer assets. Cache validation happens before every reuse.
  const cached = await env.DB.prepare("SELECT file_id FROM provider_files WHERE cache_key = ?").bind(key).first<{ file_id: string }>();
  if (cached) {
    const check = await fetch(API + "/files/" + cached.file_id, {
      headers: { Authorization: "Bearer " + env.OPENAI_API_KEY!.trim() }, signal: AbortSignal.timeout(20_000),
    });
    if (check.ok) {
      await check.body?.cancel();
      return cached.file_id;
    }
    if (check.status !== 404) throw new ProductionError("The provider could not verify a production runtime file.");
  }
  const response = await runtimeAsset(env, item.name);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== item.bytes || await sha256(bytes) !== item.sha256) throw new ProductionError("The hosted production runtime failed its integrity check.");
  const id = await upload(env, new File([bytes], item.name));
  await env.DB.prepare("INSERT INTO provider_files (cache_key, file_id, created_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET file_id=excluded.file_id, created_at=excluded.created_at").bind(key, id, Date.now()).run();
  return id;
}

export async function uploadMaster(env: Env, job: string, side: "front" | "back") {
  const name = masterName(side);
  const object = await env.BUCKET.get(prefix(job) + name);
  if (!object) throw new ProductionError("A locked image master could not be opened.");
  const data = await object.arrayBuffer();
  if (await sha256(data) !== object.customMetadata?.sha256) throw new ProductionError("A locked image master failed its integrity check.");
  return upload(env, new File([data], name, { type: "image/png" }));
}

const RUN_INSTRUCTIONS = [
  "You are executing the My Jersey production workflow. You have one task: use your hosted shell to run the supplied native vector reconstruction and print preflight from two immutable PNG image masters.",
  "Use Python 3.11. Run cd /mnt/data && OPENBLAS_NUM_THREADS=2 python3 /mnt/data/launch.py. Allow enough time for a two-panel vector trace and two 600 DPI Ghostscript renders.",
  "If one shell call cannot wait for the job, start the same command once in a detached process, redirect to /mnt/data/my-jersey-production.log, then wait and inspect its log and exit status. Do not start a duplicate process.",
  "The required artifact directory is /mnt/data/my-jersey-output. Do not alter the masters, launcher, toolkit, generated files, or validation results. Do not attempt to fabricate EPS, preview or report files or use another vectorization method.",
  "After launch finishes, list this directory and report the real result. If the process failed, return its real error and stop.",
].join("\n");

export async function startVectorization(env: Env, mode: Mode, ids: string[]) {
  const response = await postJSON<ResponseBody>(env, "/responses", {
    model: SOL, background: true, store: true, reasoning: { effort: "medium" },
    service_tier: tier(mode), max_output_tokens: 6500,
    input: RUN_INSTRUCTIONS,
    tool_choice: "required",
    tools: [{ type: "shell", environment: { type: "container_auto", file_ids: ids, memory_limit: "4g", network_policy: { type: "disabled" } } }],
  });
  return response.id;
}

export async function vectorStatus(env: Env, id: string) {
  if (!/^resp_[\w-]+$/.test(id)) throw new ProductionError("The provider did not create a hosted production job.");
  const response = await (await openAI(env, "/responses/" + id)).json<ResponseBody>();
  let container: string | undefined;
  let validating = false;
  for (const item of response.output ?? []) {
    const citedContainer = item.content?.flatMap(part => part.annotations ?? []).find(a => a.container_id)?.container_id;
    if (item.type === "shell_call") container = item.environment?.container_id ?? container;
    container = item.container_id ?? citedContainer ?? container;
    if (item.type !== "shell_call_output") continue;
    for (const log of item.output ?? []) {
      if (log.stdout?.includes("MYJERSEY_STAGE=validation")) validating = true;
    }
  }
  // A file-independent status may have a shell output truncated by the provider.
  // The R2 writer still requires the measured validation file and verified artifact hashes.
  if (container && !/^cntr_[\w-]+$/.test(container)) container = undefined;
  return { status: response.status, validating, container: container ?? null, serviceTier: response.service_tier ?? null };
}

export async function hostedFiles(env: Env, container: string, names: string[]) {
  const files: Record<string, string> = {};
  let after: string | null = null;
  for (let page = 0; page < 4; page++) {
    const query = new URLSearchParams({ limit: "100" });
    if (after) query.set("after", after);
    const response = await openAI(env, "/containers/" + container + "/files?" + query);
    const result = await response.json<{ data: { id: string; path: string }[]; has_more?: boolean; last_id?: string }>();
    for (const artifact of result.data) {
      const basename = artifact.path.split("/").pop();
      if (artifact.path.includes("/my-jersey-output/") && basename && names.includes(basename) &&
          /^(?:cfile_|file-)[\w-]+$/.test(artifact.id)) files[basename] = artifact.id;
    }
    if (!result.has_more || !result.last_id || names.every(name => files[name])) break;
    after = result.last_id;
  }
  if (!names.every(name => files[name])) throw new ProductionError("The hosted vector run did not produce both verified EPS files and proofs.");
  return files;
}

export async function hostedArtifact(env: Env, container: string, file: string, max: number) {
  const response = await openAI(env, "/containers/" + container + "/files/" + file + "/content");
  const reader = response.body?.getReader();
  if (!reader) throw new ProductionError("A hosted artifact had no downloadable content.");
  const buffers: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) throw new ProductionError("A hosted artifact exceeded its production size limit.");
      buffers.push(value);
    }
    if (!size) throw new ProductionError("A hosted artifact was empty.");
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of buffers) { bytes.set(part, offset); offset += part.length; }
  return bytes.buffer;
}
