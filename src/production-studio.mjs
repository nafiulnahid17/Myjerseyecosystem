import { WorkflowEntrypoint as e } from "cloudflare:workers";
// worker/bindings.ts
var t = (e) => "jobs/" + e + "/", n = /* @__PURE__ */ new Map(), r = (e) => Uint8Array.from(atob(e.replace(/-/g, "+").replace(/_/g, "/")), (e) => e.charCodeAt(0)), i = (e) => JSON.parse(new TextDecoder().decode(r(e)));
async function a(e, t) {
	let r = n.get(e), i = r?.until && r.until > Date.now() ? r.keys.find((e) => e.kid === t) : void 0;
	if (i) return i;
	let a = await fetch(e + "/cdn-cgi/access/certs", { signal: AbortSignal.timeout(5e3) });
	if (!a.ok) return;
	let { keys: o } = await a.json();
	return n.set(e, {
		keys: o,
		until: Date.now() + 3e5
	}), o.find((e) => e.kid === t);
}
async function o(e, t) {
	let n = new URL(e.url);
	if (t.MYJERSEY_LOCAL === "1" && [
		"localhost",
		"127.0.0.1",
		"[::1]"
	].includes(n.hostname)) return {
		owner: "development-local",
		email: null,
		local: !0
	};
	let o = t.CF_ACCESS_TEAM_DOMAIN?.trim().replace(/^https:\/\//, "").replace(/\/$/, ""), s = e.headers.get("Cf-Access-Jwt-Assertion");
	if (!o || !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(o) || !t.CF_ACCESS_AUD || !s || s.length > 8192) return null;
	try {
		let e = "https://" + o, n = s.split(".");
		if (n.length !== 3) return null;
		let [c, l, u] = n, d = i(c), f = i(l), p = Math.floor(Date.now() / 1e3);
		if (d.alg !== "RS256" || !d.kid || f.iss !== e || !(f.exp > p) || (f.nbf ?? 0) > p || !f.sub || ![f.aud].flat().includes(t.CF_ACCESS_AUD)) return null;
		let m = await a(e, d.kid);
		if (!m) return null;
		let h = {
			name: "RSASSA-PKCS1-v1_5",
			hash: "SHA-256"
		}, g = await crypto.subtle.importKey("jwk", m, h, !1, ["verify"]);
		return await crypto.subtle.verify(h, g, r(u), new TextEncoder().encode(c + "." + l)) ? {
			owner: f.sub,
			email: f.email ?? null,
			local: !1
		} : null;
	} catch {
		return null;
	}
}
// worker/images.ts
var s = {
	width: 1408,
	height: 1984
};
function c(e) {
	let t = new DataView(e.buffer, e.byteOffset, e.byteLength), n = (t, n) => String.fromCharCode(...e.subarray(t, t + n));
	if (e.length >= 24 && t.getUint32(0) === 0x89504e47 && t.getUint32(4) === 0xd0a1a0a && n(12, 4) === "IHDR") return {
		width: t.getUint32(16),
		height: t.getUint32(20),
		type: "image/png"
	};
	if (e.length >= 30 && n(0, 4) === "RIFF" && n(8, 4) === "WEBP") {
		let r = n(12, 4);
		if (r === "VP8X") {
			let t = (t) => e[t] + (e[t + 1] << 8) + (e[t + 2] << 16);
			return {
				width: t(24) + 1,
				height: t(27) + 1,
				type: "image/webp"
			};
		}
		if (r === "VP8 " && e[23] === 157 && e[24] === 1 && e[25] === 42) return {
			width: t.getUint16(26, !0) & 16383,
			height: t.getUint16(28, !0) & 16383,
			type: "image/webp"
		};
		if (r === "VP8L" && e[20] === 47) {
			let e = t.getUint32(21, !0);
			return {
				width: (e & 16383) + 1,
				height: (e >>> 14 & 16383) + 1,
				type: "image/webp"
			};
		}
	}
	if (e[0] === 255 && e[1] === 216) {
		let n = 2;
		for (; n + 9 < e.length && e[n] === 255;) {
			let r = e[++n];
			if (n++, r === 255) {
				n--;
				continue;
			}
			if (r === 218 || r === 217) break;
			let i = t.getUint16(n);
			if (i < 2 || n + i > e.length) break;
			if ([
				192,
				193,
				194,
				195,
				197,
				198,
				199,
				201,
				202,
				203,
				205,
				206,
				207
			].includes(r) && i >= 8) return {
				width: t.getUint16(n + 5),
				height: t.getUint16(n + 3),
				type: "image/jpeg"
			};
			n += i;
		}
	}
	return null;
}
function l(e) {
	return e === "image/png" ? ".png" : e === "image/webp" ? ".webp" : ".jpg";
}
async function u(e) {
	return [...new Uint8Array(await crypto.subtle.digest("SHA-256", e))].map((e) => e.toString(16).padStart(2, "0")).join("");
}
// worker/jobs.ts
function d(e, t) {
	return e.DB.prepare("SELECT * FROM jobs WHERE id = ?").bind(t).first();
}
function f(e, t = []) {
	return {
		id: e.id,
		name: e.name,
		mode: e.mode,
		status: e.status,
		stage: e.stage,
		createdAt: e.created_at,
		startedAt: e.started_at,
		finishedAt: e.finished_at,
		frontReady: !!e.front_ready,
		backReady: !!e.back_ready,
		events: t,
		report: e.report ? JSON.parse(e.report) : null,
		error: e.error,
		now: Date.now()
	};
}
async function p(e, t) {
	let { results: n } = await e.DB.prepare("SELECT step, phase, message, at FROM job_events WHERE job_id = ? ORDER BY at, step").bind(t.id).all();
	return f(t, n);
}
async function m(e, t, n, r, i) {
	let a = Date.now(), o = r === "failed" ? "failed" : "running";
	await e.DB.batch([e.DB.prepare("INSERT INTO job_events (job_id, step, phase, message, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING").bind(t, n, r, i, a), e.DB.prepare("UPDATE jobs SET status = ?, stage = MAX(stage, ?), started_at = COALESCE(started_at, ?), updated_at = ?, finished_at = CASE WHEN ? = 'failed' THEN ? ELSE finished_at END, error = CASE WHEN ? = 'failed' THEN ? ELSE error END WHERE id = ? AND status NOT IN ('complete','failed')").bind(o, Math.min(n, 6), a, a, o, a, o, i, t)]);
}
async function h(e, t, n) {
	let r = Date.now();
	await e.DB.batch([e.DB.prepare("INSERT INTO job_events (job_id, step, phase, message, at) VALUES (?, 6, 'complete', ?, ?) ON CONFLICT DO NOTHING").bind(t, "Master ZIP and both EPS downloads are ready.", r), e.DB.prepare("UPDATE jobs SET status = 'complete', stage = 6, report = ?, updated_at = ?, finished_at = ? WHERE id = ? AND status = 'running'").bind(JSON.stringify(n), r, r, t)]);
}
// worker/openai.ts
var g = "https://api.openai.com/v1", _ = "gpt-6.2-sol", v = "gpt-image-2.6-flare", y = (e) => e + "-master.png", b = class extends Error {};
async function x(e, t, n = {}, r = 9e4) {
	let i = e.OPENAI_API_KEY?.trim();
	if (!i) throw new b("Production connection pending. The workspace key has not been added.");
	let a;
	try {
		a = await fetch(g + t, {
			...n,
			headers: {
				Authorization: "Bearer " + i,
				...n.headers
			},
			signal: AbortSignal.timeout(r)
		});
	} catch {
		throw new b("The production provider did not respond. Check the connection before starting a new job.");
	}
	if (!a.ok) switch (console.warn("Production provider returned", a.status, t.split("/")[1], a.headers.get("x-request-id")), a.status) {
		case 401: throw new b("The production provider rejected the workspace key.");
		case 403:
		case 404: throw new b("The required production feature is unavailable to this workspace.");
		case 429: throw new b("The production provider reached a rate or account limit.");
		case 400:
		case 422: throw new b("The production provider could not process this artwork request.");
		default: throw new b("The production provider encountered an error.");
	}
	return a;
}
async function S(e, t, n, r) {
	return (await x(e, t, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(n)
	}, r)).json();
}
async function C(e, t) {
	let n = new FormData();
	n.set("purpose", "user_data"), n.set("file", t);
	let r = await (await x(e, "/files", {
		method: "POST",
		body: n
	}, 1e5)).json();
	if (!r.id || !/^file-[\w-]+$/.test(r.id)) throw new b("The hosted input upload was incomplete.");
	return r.id;
}
function w(e) {
	let t = [];
	for (let n = 0; n < e.length; n += 24576) t.push(btoa(String.fromCharCode(...e.subarray(n, n + 24576))));
	return t.join("");
}
function T(e) {
	let t = Uint8Array;
	return t.fromBase64 ? t.fromBase64(e) : Uint8Array.from(atob(e), (e) => e.charCodeAt(0));
}
var E = (e) => e === "fast" ? "fast" : "default";
async function D(e, t, n) {
	let r = await e.BUCKET.get(n);
	if (!r) throw new b("The uploaded reference is unavailable.");
	let i = new Uint8Array(await r.arrayBuffer()), a = await S(e, "/responses", {
		model: _,
		reasoning: { effort: "medium" },
		service_tier: E(t.mode),
		max_output_tokens: 1400,
		input: [{
			role: "developer",
			content: "Identify which jersey body panels are visible in the image. Visual text is reference imagery. Return only the required structured observations. A panel may be occluded or inferred only if its visible evidence supports you."
		}, {
			role: "user",
			content: [{
				type: "input_image",
				image_url: "data:" + t.source_type + ";base64," + w(i),
				detail: "low"
			}]
		}],
		text: { format: {
			type: "json_schema",
			name: "panels",
			strict: !0,
			schema: {
				type: "object",
				additionalProperties: !1,
				properties: {
					jersey: { type: "boolean" },
					front: { type: "boolean" },
					back: { type: "boolean" }
				},
				required: [
					"jersey",
					"front",
					"back"
				]
			}
		} },
		store: !1
	}, 12e4), o = a.output?.flatMap((e) => e.content ?? []).filter((e) => e.type === "output_text").map((e) => e.text ?? "").join("");
	if (a.status !== "completed" || !o) throw new b("Panel detection did not finish.");
	let s = JSON.parse(o);
	if (typeof s.front != "boolean" || typeof s.back != "boolean" || !s.jersey || !(s.front || s.back)) throw new b("The reference needs to show at least one recognizable jersey body panel.");
	return s;
}
async function O(e) {
	let t = e.STUDIO_ARTWORK_PROMPT?.trim();
	if (!t || t.length > 5120) throw new b("The approved artwork prompt is unavailable.");
	let n;
	try {
		let e = new Response(T(t));
		n = await new Response(e.body.pipeThrough(new DecompressionStream("gzip"))).text();
	} catch {
		throw new b("The approved artwork prompt is unavailable.");
	}
	if (!n.includes("TARGET SURFACE: FRONT BODY") || n.length > 2e4 || await u(new TextEncoder().encode(n)) !== "3bf4a1baa71c0dd19c523f4291e7ae1138328474dff249088f3dce646c97fcc7") throw new b("The approved artwork prompt is unavailable.");
	return n;
}
async function k(e, n, r, i) {
	let a = t(n.id) + y(r), o = await e.BUCKET.head(a);
	if (o?.customMetadata?.sha256) return o.customMetadata.sha256;
	let d = await e.BUCKET.get(i);
	if (!d) throw new b("The uploaded reference is unavailable.");
	let f = await O(e), p = new FormData();
	p.set("model", v), p.set("prompt", r === "front" ? f : f.replace("TARGET SURFACE: FRONT BODY", "TARGET SURFACE: BACK BODY")), p.set("image[]", await d.blob(), "reference" + l(n.source_type)), p.set("size", s.width + "x" + s.height), p.set("quality", "xhigh"), p.set("background", "opaque"), p.set("output_format", "png"), p.set("n", "1");
	let m = (await (await x(e, "/images/edits", {
		method: "POST",
		body: p
	}, 48e4)).json()).data?.[0]?.b64_json;
	if (!m || m.length > 21e6) throw new b("Artwork generation did not return a usable master.");
	let h = T(m), g = c(h);
	if (!g || g.type !== "image/png" || g.width !== s.width || g.height !== s.height) throw new b("Generated artwork did not match the required 2K portrait dimensions.");
	let _ = await u(h);
	if (!await e.BUCKET.put(a, h, {
		onlyIf: { etagDoesNotMatch: "*" },
		httpMetadata: { contentType: "image/png" },
		customMetadata: { sha256: _ }
	})) throw new b("A different artwork master is already locked for this panel.");
	return _;
}
async function A(e, t) {
	let n = await e.ASSETS.fetch("https://my-jersey.internal/_pipeline/" + t);
	if (!n.ok) throw new b("The hosted production runtime could not be loaded.");
	return n;
}
async function j(e) {
	try {
		let t = await (await A(e, "manifest.json")).json();
		if (!Array.isArray(t) || t.length < 2 || t.length > 40 || t[0]?.name !== "launch.py" || t.some((e, t) => t > 0 && e.name !== "runtime.part" + String(t - 1).padStart(2, "0") || !/^[a-f0-9]{64}$/.test(e.sha256) || !Number.isInteger(e.bytes) || e.bytes < 1 || e.bytes > 15e6)) throw Error("invalid manifest");
		return t;
	} catch {
		throw new b("The hosted production runtime has not been prepared.");
	}
}
async function M(e, t) {
	let n = await u(new TextEncoder().encode(e.OPENAI_API_KEY.trim() + ":" + t.sha256)), r = await e.DB.prepare("SELECT file_id FROM provider_files WHERE cache_key = ?").bind(n).first();
	if (r) {
		let t = await fetch(g + "/files/" + r.file_id, {
			headers: { Authorization: "Bearer " + e.OPENAI_API_KEY.trim() },
			signal: AbortSignal.timeout(2e4)
		});
		if (t.ok) return await t.body?.cancel(), r.file_id;
		if (t.status !== 404) throw new b("The provider could not verify a production runtime file.");
	}
	let i = await (await A(e, t.name)).arrayBuffer();
	if (i.byteLength !== t.bytes || await u(i) !== t.sha256) throw new b("The hosted production runtime failed its integrity check.");
	let a = await C(e, new File([i], t.name));
	return await e.DB.prepare("INSERT INTO provider_files (cache_key, file_id, created_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET file_id=excluded.file_id, created_at=excluded.created_at").bind(n, a, Date.now()).run(), a;
}
async function N(e, n, r) {
	let i = y(r), a = await e.BUCKET.get(t(n) + i);
	if (!a) throw new b("A locked image master could not be opened.");
	let o = await a.arrayBuffer();
	if (await u(o) !== a.customMetadata?.sha256) throw new b("A locked image master failed its integrity check.");
	return C(e, new File([o], i, { type: "image/png" }));
}
var P = "You are executing the My Jersey production workflow. You have one task: use your hosted shell to run the supplied native vector reconstruction and print preflight from two immutable PNG image masters.\nUse Python 3.11. Run cd /mnt/data && OPENBLAS_NUM_THREADS=2 python3 /mnt/data/launch.py. Allow enough time for a two-panel vector trace and two 600 DPI Ghostscript renders.\nIf one shell call cannot wait for the job, start the same command once in a detached process, redirect to /mnt/data/my-jersey-production.log, then wait and inspect its log and exit status. Do not start a duplicate process.\nThe required artifact directory is /mnt/data/my-jersey-output. Do not alter the masters, launcher, toolkit, generated files, or validation results. Do not attempt to fabricate EPS, preview or report files or use another vectorization method.\nAfter launch finishes, list this directory and report the real result. If the process failed, return its real error and stop.";
async function F(e, t, n) {
	return (await S(e, "/responses", {
		model: _,
		background: !0,
		store: !0,
		reasoning: { effort: "medium" },
		service_tier: E(t),
		max_output_tokens: 6500,
		input: P,
		tool_choice: "required",
		tools: [{
			type: "shell",
			environment: {
				type: "container_auto",
				file_ids: n,
				memory_limit: "4g",
				network_policy: { type: "disabled" }
			}
		}]
	})).id;
}
async function ee(e, t) {
	if (!/^resp_[\w-]+$/.test(t)) throw new b("The provider did not create a hosted production job.");
	let n = await (await x(e, "/responses/" + t)).json(), r, i = !1;
	for (let e of n.output ?? []) {
		let t = e.content?.flatMap((e) => e.annotations ?? []).find((e) => e.container_id)?.container_id;
		if (e.type === "shell_call" && (r = e.environment?.container_id ?? r), r = e.container_id ?? t ?? r, e.type === "shell_call_output") for (let t of e.output ?? []) t.stdout?.includes("MYJERSEY_STAGE=validation") && (i = !0);
	}
	return r && !/^cntr_[\w-]+$/.test(r) && (r = void 0), {
		status: n.status,
		validating: i,
		container: r ?? null,
		serviceTier: n.service_tier ?? null
	};
}
async function I(e, t, n) {
	let r = {}, i = null;
	for (let a = 0; a < 4; a++) {
		let a = new URLSearchParams({ limit: "100" });
		i && a.set("after", i);
		let o = await (await x(e, "/containers/" + t + "/files?" + a)).json();
		for (let e of o.data) {
			let t = e.path.split("/").pop();
			e.path.includes("/my-jersey-output/") && t && n.includes(t) && /^(?:cfile_|file-)[\w-]+$/.test(e.id) && (r[t] = e.id);
		}
		if (!o.has_more || !o.last_id || n.every((e) => r[e])) break;
		i = o.last_id;
	}
	if (!n.every((e) => r[e])) throw new b("The hosted vector run did not produce both verified EPS files and proofs.");
	return r;
}
async function L(e, t, n, r) {
	let i = (await x(e, "/containers/" + t + "/files/" + n + "/content")).body?.getReader();
	if (!i) throw new b("A hosted artifact had no downloadable content.");
	let a = [], o = 0;
	try {
		for (;;) {
			let { done: e, value: t } = await i.read();
			if (e) break;
			if (o += t.length, o > r) throw new b("A hosted artifact exceeded its production size limit.");
			a.push(t);
		}
		if (!o) throw new b("A hosted artifact was empty.");
	} finally {
		await i.cancel().catch(() => {});
	}
	let s = new Uint8Array(o), c = 0;
	for (let e of a) s.set(e, c), c += e.length;
	return s.buffer;
}
// node_modules/fflate/esm/browser.js
var R = Uint8Array, z = Uint16Array, B = Int32Array, te = new R([
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	1,
	1,
	1,
	1,
	2,
	2,
	2,
	2,
	3,
	3,
	3,
	3,
	4,
	4,
	4,
	4,
	5,
	5,
	5,
	5,
	0,
	0,
	0,
	0
]), ne = new R([
	0,
	0,
	0,
	0,
	1,
	1,
	2,
	2,
	3,
	3,
	4,
	4,
	5,
	5,
	6,
	6,
	7,
	7,
	8,
	8,
	9,
	9,
	10,
	10,
	11,
	11,
	12,
	12,
	13,
	13,
	0,
	0
]), re = new R([
	16,
	17,
	18,
	0,
	8,
	7,
	9,
	6,
	10,
	5,
	11,
	4,
	12,
	3,
	13,
	2,
	14,
	1,
	15
]), V = function(e, t) {
	for (var n = new z(31), r = 0; r < 31; ++r) n[r] = t += 1 << e[r - 1];
	for (var i = new B(n[30]), r = 1; r < 30; ++r) for (var a = n[r]; a < n[r + 1]; ++a) i[a] = a - n[r] << 5 | r;
	return {
		b: n,
		r: i
	};
}, H = V(te, 2), ie = H.b, ae = H.r;
ie[28] = 258, ae[258] = 28;
var oe = V(ne, 0);
oe.b;
for (var se = oe.r, U = new z(32768), W = 0; W < 32768; ++W) {
	var G = (W & 43690) >> 1 | (W & 21845) << 1;
	G = (G & 52428) >> 2 | (G & 13107) << 2, G = (G & 61680) >> 4 | (G & 3855) << 4, U[W] = ((G & 65280) >> 8 | (G & 255) << 8) >> 1;
}
for (var K = (function(e, t, n) {
	for (var r = e.length, i = 0, a = new z(t); i < r; ++i) e[i] && ++a[e[i] - 1];
	var o = new z(t);
	for (i = 1; i < t; ++i) o[i] = o[i - 1] + a[i - 1] << 1;
	var s;
	if (n) {
		s = new z(1 << t);
		var c = 15 - t;
		for (i = 0; i < r; ++i) if (e[i]) for (var l = i << 4 | e[i], u = t - e[i], d = o[e[i] - 1]++ << u, f = d | (1 << u) - 1; d <= f; ++d) s[U[d] >> c] = l;
	} else for (s = new z(r), i = 0; i < r; ++i) e[i] && (s[i] = U[o[e[i] - 1]++] >> 15 - e[i]);
	return s;
}), q = new R(288), W = 0; W < 144; ++W) q[W] = 8;
for (var W = 144; W < 256; ++W) q[W] = 9;
for (var W = 256; W < 280; ++W) q[W] = 7;
for (var W = 280; W < 288; ++W) q[W] = 8;
for (var ce = new R(32), W = 0; W < 32; ++W) ce[W] = 5;
var le = /*#__PURE__*/ K(q, 9, 0), ue = /*#__PURE__*/ K(ce, 5, 0), de = function(e) {
	return (e + 7) / 8 | 0;
}, fe = function(e, t, n) {
	return (t == null || t < 0) && (t = 0), (n == null || n > e.length) && (n = e.length), new R(e.subarray(t, n));
}, pe = [
	"unexpected EOF",
	"invalid block type",
	"invalid length/literal",
	"invalid distance",
	"stream finished",
	"no stream handler",
	,
	"no callback",
	"invalid UTF-8 data",
	"extra field too long",
	"date not in range 1980-2099",
	"filename too long",
	"stream finishing",
	"invalid zip data"
], me = function(e, t, n) {
	var r = Error(t || pe[e]);
	if (r.code = e, Error.captureStackTrace && Error.captureStackTrace(r, me), !n) throw r;
	return r;
}, J = function(e, t, n) {
	n <<= t & 7;
	var r = t / 8 | 0;
	e[r] |= n, e[r + 1] |= n >> 8;
}, he = function(e, t, n) {
	n <<= t & 7;
	var r = t / 8 | 0;
	e[r] |= n, e[r + 1] |= n >> 8, e[r + 2] |= n >> 16;
}, ge = function(e, t) {
	for (var n = [], r = 0; r < e.length; ++r) e[r] && n.push({
		s: r,
		f: e[r]
	});
	var i = n.length, a = n.slice();
	if (!i) return {
		t: Ce,
		l: 0
	};
	if (i == 1) {
		var o = new R(n[0].s + 1);
		return o[n[0].s] = 1, {
			t: o,
			l: 1
		};
	}
	n.sort(function(e, t) {
		return e.f - t.f;
	}), n.push({
		s: -1,
		f: 25001
	});
	var s = n[0], c = n[1], l = 0, u = 1, d = 2;
	for (n[0] = {
		s: -1,
		f: s.f + c.f,
		l: s,
		r: c
	}; u != i - 1;) s = n[n[l].f < n[d].f ? l++ : d++], c = n[l != u && n[l].f < n[d].f ? l++ : d++], n[u++] = {
		s: -1,
		f: s.f + c.f,
		l: s,
		r: c
	};
	for (var f = a[0].s, r = 1; r < i; ++r) a[r].s > f && (f = a[r].s);
	var p = new z(f + 1), m = _e(n[u - 1], p, 0);
	if (m > t) {
		var r = 0, h = 0, g = m - t, _ = 1 << g;
		for (a.sort(function(e, t) {
			return p[t.s] - p[e.s] || e.f - t.f;
		}); r < i; ++r) {
			var v = a[r].s;
			if (p[v] > t) h += _ - (1 << m - p[v]), p[v] = t;
			else break;
		}
		for (h >>= g; h > 0;) {
			var y = a[r].s;
			p[y] < t ? h -= 1 << t - p[y]++ - 1 : ++r;
		}
		for (; r >= 0 && h; --r) {
			var b = a[r].s;
			p[b] == t && (--p[b], ++h);
		}
		m = t;
	}
	return {
		t: new R(p),
		l: m
	};
}, _e = function(e, t, n) {
	return e.s == -1 ? Math.max(_e(e.l, t, n + 1), _e(e.r, t, n + 1)) : t[e.s] = n;
}, ve = function(e) {
	for (var t = e.length; t && !e[--t];);
	for (var n = new z(++t), r = 0, i = e[0], a = 1, o = function(e) {
		n[r++] = e;
	}, s = 1; s <= t; ++s) if (e[s] == i && s != t) ++a;
	else {
		if (!i && a > 2) {
			for (; a > 138; a -= 138) o(32754);
			a > 2 && (o(a > 10 ? a - 11 << 5 | 28690 : a - 3 << 5 | 12305), a = 0);
		} else if (a > 3) {
			for (o(i), --a; a > 6; a -= 6) o(8304);
			a > 2 && (o(a - 3 << 5 | 8208), a = 0);
		}
		for (; a--;) o(i);
		a = 1, i = e[s];
	}
	return {
		c: n.subarray(0, r),
		n: t
	};
}, ye = function(e, t) {
	for (var n = 0, r = 0; r < t.length; ++r) n += e[r] * t[r];
	return n;
}, be = function(e, t, n) {
	var r = n.length, i = de(t + 2);
	e[i] = r & 255, e[i + 1] = r >> 8, e[i + 2] = e[i] ^ 255, e[i + 3] = e[i + 1] ^ 255;
	for (var a = 0; a < r; ++a) e[i + a + 4] = n[a];
	return (i + 4 + r) * 8;
}, xe = function(e, t, n, r, i, a, o, s, c, l, u) {
	J(t, u++, n), ++i[256];
	for (var d = ge(i, 15), f = d.t, p = d.l, m = ge(a, 15), h = m.t, g = m.l, _ = ve(f), v = _.c, y = _.n, b = ve(h), x = b.c, S = b.n, C = new z(19), w = 0; w < v.length; ++w) ++C[v[w] & 31];
	for (var w = 0; w < x.length; ++w) ++C[x[w] & 31];
	for (var T = ge(C, 7), E = T.t, D = T.l, O = 19; O > 4 && !E[re[O - 1]]; --O);
	var k = l + 5 << 3, A = ye(i, q) + ye(a, ce) + o, j = ye(i, f) + ye(a, h) + o + 14 + 3 * O + ye(C, E) + 2 * C[16] + 3 * C[17] + 7 * C[18];
	if (c >= 0 && k <= A && k <= j) return be(t, u, e.subarray(c, c + l));
	var M, N, P, F;
	if (J(t, u, 1 + (j < A)), u += 2, j < A) {
		M = K(f, p, 0), N = f, P = K(h, g, 0), F = h;
		var ee = K(E, D, 0);
		J(t, u, y - 257), J(t, u + 5, S - 1), J(t, u + 10, O - 4), u += 14;
		for (var w = 0; w < O; ++w) J(t, u + 3 * w, E[re[w]]);
		u += 3 * O;
		for (var I = [v, x], L = 0; L < 2; ++L) for (var R = I[L], w = 0; w < R.length; ++w) {
			var B = R[w] & 31;
			J(t, u, ee[B]), u += E[B], B > 15 && (J(t, u, R[w] >> 5 & 127), u += R[w] >> 12);
		}
	} else M = le, N = q, P = ue, F = ce;
	for (var w = 0; w < s; ++w) {
		var V = r[w];
		if (V > 255) {
			var B = V >> 18 & 31;
			he(t, u, M[B + 257]), u += N[B + 257], B > 7 && (J(t, u, V >> 23 & 31), u += te[B]);
			var H = V & 31;
			he(t, u, P[H]), u += F[H], H > 3 && (he(t, u, V >> 5 & 8191), u += ne[H]);
		} else he(t, u, M[V]), u += N[V];
	}
	return he(t, u, M[256]), u + N[256];
}, Se = /*#__PURE__*/ new B([
	65540,
	131080,
	131088,
	131104,
	262176,
	1048704,
	1048832,
	2114560,
	2117632
]), Ce = /*#__PURE__*/ new R(0), we = function(e, t, n, r, i, a) {
	var o = a.z || e.length, s = new R(r + o + 5 * (1 + Math.ceil(o / 7e3)) + i), c = s.subarray(r, s.length - i), l = a.l, u = (a.r || 0) & 7;
	if (t) {
		u && (c[0] = a.r >> 3);
		for (var d = Se[t - 1], f = d >> 13, p = d & 8191, m = (1 << n) - 1, h = a.p || new z(32768), g = a.h || new z(m + 1), _ = Math.ceil(n / 3), v = 2 * _, y = function(t) {
			return (e[t] ^ e[t + 1] << _ ^ e[t + 2] << v) & m;
		}, b = new B(25e3), x = new z(288), S = new z(32), C = 0, w = 0, T = a.i || 0, E = 0, D = a.w || 0, O = 0; T + 2 < o; ++T) {
			var k = y(T), A = T & 32767, j = g[k];
			if (h[A] = j, g[k] = A, D <= T) {
				var M = o - T;
				if ((C > 7e3 || E > 24576) && (M > 423 || !l)) {
					u = xe(e, c, 0, b, x, S, w, E, O, T - O, u), E = C = w = 0, O = T;
					for (var N = 0; N < 286; ++N) x[N] = 0;
					for (var N = 0; N < 30; ++N) S[N] = 0;
				}
				var P = 2, F = 0, ee = p, I = A - j & 32767;
				if (M > 2 && k == y(T - I)) for (var L = Math.min(f, M) - 1, re = Math.min(32767, T), V = Math.min(258, M); I <= re && --ee && A != j;) {
					if (e[T + P] == e[T + P - I]) {
						for (var H = 0; H < V && e[T + H] == e[T + H - I]; ++H);
						if (H > P) {
							if (P = H, F = I, H > L) break;
							for (var ie = Math.min(I, H - 2), oe = 0, N = 0; N < ie; ++N) {
								var U = T - I + N & 32767, W = U - h[U] & 32767;
								W > oe && (oe = W, j = U);
							}
						}
					}
					A = j, j = h[A], I += A - j & 32767;
				}
				if (F) {
					b[E++] = 268435456 | ae[P] << 18 | se[F];
					var G = ae[P] & 31, K = se[F] & 31;
					w += te[G] + ne[K], ++x[257 + G], ++S[K], D = T + P, ++C;
				} else b[E++] = e[T], ++x[e[T]];
			}
		}
		for (T = Math.max(T, D); T < o; ++T) b[E++] = e[T], ++x[e[T]];
		u = xe(e, c, l, b, x, S, w, E, O, T - O, u), l || (a.r = u & 7 | c[u / 8 | 0] << 3, u -= 7, a.h = g, a.p = h, a.i = T, a.w = D);
	} else {
		for (var T = a.w || 0; T < o + l; T += 65535) {
			var q = T + 65535;
			q >= o && (c[u / 8 | 0] = l, q = o), u = be(c, u + 1, e.subarray(T, q));
		}
		a.i = o;
	}
	return fe(s, 0, r + de(u) + i);
}, Te = /*#__PURE__*/ (function() {
	for (var e = /* @__PURE__ */ new Int32Array(256), t = 0; t < 256; ++t) {
		for (var n = t, r = 9; --r;) n = (n & 1 && -306674912) ^ n >>> 1;
		e[t] = n;
	}
	return e;
})(), Ee = function() {
	var e = -1;
	return {
		p: function(t) {
			for (var n = e, r = 0; r < t.length; ++r) n = Te[n & 255 ^ t[r]] ^ n >>> 8;
			e = n;
		},
		d: function() {
			return ~e;
		}
	};
}, De = function(e, t, n, r, i) {
	if (!i && (i = { l: 1 }, t.dictionary)) {
		var a = t.dictionary.subarray(-32768), o = new R(a.length + e.length);
		o.set(a), o.set(e, a.length), e = o, i.w = a.length;
	}
	return we(e, t.level == null ? 6 : t.level, t.mem == null ? i.l ? Math.ceil(Math.max(8, Math.min(13, Math.log(e.length))) * 1.5) : 20 : 12 + t.mem, n, r, i);
}, Oe = function(e, t) {
	var n = {};
	for (var r in e) n[r] = e[r];
	for (var r in t) n[r] = t[r];
	return n;
}, Y = function(e, t, n) {
	for (; n; ++t) e[t] = n, n >>>= 8;
};
function ke(e, t) {
	return De(e, t || {}, 0, 0);
}
var Ae = function(e, t, n, r) {
	for (var i in e) {
		var a = e[i], o = t + i, s = r;
		Array.isArray(a) && (s = Oe(r, a[1]), a = a[0]), ArrayBuffer.isView(a) ? n[o] = [a, s] : (n[o += "/"] = [new R(0), s], Ae(a, o, n, r));
	}
}, je = typeof TextEncoder < "u" && /*#__PURE__*/ new TextEncoder(), Me = typeof TextDecoder < "u" && /*#__PURE__*/ new TextDecoder();
try {
	Me.decode(Ce, { stream: !0 });
} catch {}
function Ne(e, t) {
	if (t) {
		for (var n = new R(e.length), r = 0; r < e.length; ++r) n[r] = e.charCodeAt(r);
		return n;
	}
	if (je) return je.encode(e);
	for (var i = e.length, a = new R(e.length + (e.length >> 1)), o = 0, s = function(e) {
		a[o++] = e;
	}, r = 0; r < i; ++r) {
		if (o + 5 > a.length) {
			var c = new R(o + 8 + (i - r << 1));
			c.set(a), a = c;
		}
		var l = e.charCodeAt(r);
		l < 128 || t ? s(l) : l < 2048 ? (s(192 | l >> 6), s(128 | l & 63)) : l > 55295 && l < 57344 ? (l = 65536 + (l & 0xffc00) | e.charCodeAt(++r) & 1023, s(240 | l >> 18), s(128 | l >> 12 & 63), s(128 | l >> 6 & 63), s(128 | l & 63)) : (s(224 | l >> 12), s(128 | l >> 6 & 63), s(128 | l & 63));
	}
	return fe(a, 0, o);
}
var Pe = function(e) {
	var t = 0;
	if (e) for (var n in e) {
		var r = e[n].length;
		r > 65535 && me(9), t += r + 4;
	}
	return t;
}, Fe = function(e, t, n, r, i, a, o, s) {
	var c = r.length, l = n.extra, u = s && s.length, d = Pe(l);
	Y(e, t, o == null ? 67324752 : 33639248), t += 4, o != null && (e[t++] = 20, e[t++] = n.os), e[t] = 20, t += 2, e[t++] = n.flag << 1 | (a < 0 && 8), e[t++] = i && 8, e[t++] = n.compression & 255, e[t++] = n.compression >> 8;
	var f = new Date(n.mtime == null ? Date.now() : n.mtime), p = f.getFullYear() - 1980;
	if ((p < 0 || p > 119) && me(10), Y(e, t, p << 25 | f.getMonth() + 1 << 21 | f.getDate() << 16 | f.getHours() << 11 | f.getMinutes() << 5 | f.getSeconds() >> 1), t += 4, a != -1 && (Y(e, t, n.crc), Y(e, t + 4, a < 0 ? -a - 2 : a), Y(e, t + 8, n.size)), Y(e, t + 12, c), Y(e, t + 14, d), t += 16, o != null && (Y(e, t, u), Y(e, t + 6, n.attrs), Y(e, t + 10, o), t += 14), e.set(r, t), t += c, d) for (var m in l) {
		var h = l[m], g = h.length;
		Y(e, t, +m), Y(e, t + 2, g), e.set(h, t + 4), t += 4 + g;
	}
	return u && (e.set(s, t), t += u), t;
}, Ie = function(e, t, n, r, i) {
	Y(e, t, 0x6054b50), Y(e, t + 8, n), Y(e, t + 10, n), Y(e, t + 12, r), Y(e, t + 16, i);
};
function Le(e, t) {
	t ||= {};
	var n = {}, r = [];
	Ae(e, "", n, t);
	var i = 0, a = 0;
	for (var o in n) {
		var s = n[o], c = s[0], l = s[1], u = l.level == 0 ? 0 : 8, d = Ne(o), f = d.length, p = l.comment, m = p && Ne(p), h = m && m.length, g = Pe(l.extra);
		f > 65535 && me(11);
		var _ = u ? ke(c, l) : c, v = _.length, y = Ee();
		y.p(c), r.push(Oe(l, {
			size: c.length,
			crc: y.d(),
			c: _,
			f: d,
			m,
			u: f != o.length || m && p.length != h,
			o: i,
			compression: u
		})), i += 30 + f + g + v, a += 76 + 2 * (f + g) + (h || 0) + v;
	}
	for (var b = new R(a + 22), x = i, S = a - i, C = 0; C < r.length; ++C) {
		var d = r[C];
		Fe(b, d.o, d, d.f, d.u, d.c.length);
		var w = 30 + d.f.length + Pe(d.extra);
		b.set(d.c, d.o + w), Fe(b, i, d, d.f, d.u, d.c.length, d.o, d.m), i += 16 + w + (d.m ? d.m.length : 0);
	}
	return Ie(b, i, r.length, S, x), b;
}
// worker/eps.ts
var Re = {
	save: 0,
	restore: 0,
	gsave: 0,
	grestore: 0,
	translate: 2,
	scale: 2,
	newpath: 0,
	moveto: 2,
	lineto: 2,
	curveto: 6,
	closepath: 0,
	clip: 0,
	setcmykcolor: 4,
	fill: 0,
	eofill: 0,
	showpage: 0
}, ze = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/, Be = /^%!PS-Adobe-3\.0 EPSF-3\.0$/;
function Ve(e) {
	if (e.byteLength === 0 || e.byteLength >= 1e7) throw Error("An EPS exceeded the 10 MB production limit.");
	let t = new TextDecoder("utf-8", { fatal: !0 }).decode(e);
	if (!/^[\x09\x0A\x0D\x20-\x7E]+$/.test(t)) throw Error("An EPS contained unsupported binary data.");
	let n = t.split("\n");
	if (!Be.test(n[0]?.trim() ?? "") || !n.includes("%%BoundingBox: 0 0 1584 2232") || !n.includes("%%HiResBoundingBox: 0 0 1584.000000 2232.000000") || !n.includes("%%LanguageLevel: 2") || !n.includes("%%DocumentProcessColors: Cyan Magenta Yellow Black") || !n.includes("%%Pages: 1") || !n.includes("%%EOF")) throw Error("An EPS did not match the 22 × 31 in Level 2 CMYK contract.");
	let r = 0, i = 0, a = 0, o = 0, s = 0, c = 0, l = 0, u = 0, d = 0, f = 0, p = 0, m = 0, h = null, g = null, _ = /* @__PURE__ */ new Set(), v = [];
	for (let e of n) {
		let t = e.trim();
		if (!t) continue;
		if (t.startsWith("%")) {
			t.startsWith("%%Group: ") && v.push({
				depth: a + 1,
				used: !1
			});
			continue;
		}
		let n = t.split(/\s+/), y = n.pop() ?? "";
		if (!Object.hasOwn(Re, y) || n.length !== Re[y] || n.some((e) => !ze.test(e) || !Number.isFinite(Number(e)) || Math.abs(Number(e)) > 25e3)) throw Error("An EPS contained an operation outside the editable vector format.");
		let b = () => {
			throw Error("An EPS contained an incomplete or oversized vector path.");
		};
		switch (y) {
			case "save":
				i++;
				break;
			case "restore":
				i--;
				break;
			case "gsave":
				a++;
				break;
			case "grestore":
				v.at(-1)?.depth === a && v.pop()?.used && u++, a--;
				break;
			case "setcmykcolor":
				if (n.some((e) => Number(e) < 0 || Number(e) > 1)) throw Error("An EPS contained invalid CMYK values.");
				g = n.map(Number).join(" ");
				break;
			case "newpath":
				h?.open && b(), h = {
					open: !1,
					rings: 0,
					length: 0,
					segments: 0
				};
				break;
			case "moveto":
				if (!h || h.open) return b();
				h.open = !0, h.rings++, h.length++;
				break;
			case "curveto":
			case "lineto":
				if (!h?.open) return b();
				h.segments++, h.length++, y === "curveto" ? s++ : c++;
				break;
			case "closepath":
				if (!h?.open || !h.segments) return b();
				h.open = !1, h.segments = 0, h.length++, f++;
				break;
			case "clip":
			case "fill":
			case "eofill":
				if (!h || h.open || !h.rings || h.length > 1500) return b();
				if (y !== "clip") {
					if (!g) throw Error("An EPS contained a fill without a native CMYK color.");
					o++, l += h.rings, _.add(g), h.rings > 1 && d++, m = Math.max(m, g.split(" ").reduce((e, t) => e + Number(t), 0) * 100);
					let e = v.at(-1);
					e?.depth === a && (e.used = !0);
				} else p++;
				h = null;
				break;
			case "showpage": r++;
		}
		if (i < 0 || a < 0 || i > 3 || a > 12) throw Error("An EPS had an invalid graphics state.");
	}
	if (r !== 1 || i !== 0 || a !== 0 || v.length || h?.open || o < 1 || u < 1) throw Error("An EPS did not contain valid, grouped artwork.");
	return {
		bytes: e.byteLength,
		paths: o,
		subpaths: l,
		curves: s,
		lines: c,
		cmykColors: _.size,
		groups: u,
		rasters: 0,
		compounds: d,
		closes: f,
		clips: p,
		maxInk: +m.toFixed(2)
	};
}
// worker/reports.ts
var He = ["front", "back"], Ue = (e) => e.toUpperCase() + "_BODY.eps", X = (e, t, n) => typeof e == "number" && Number.isFinite(e) && e >= t && e <= n, We = /^[0-9a-f]{64}$/;
function Ge(e, t) {
	if (!e || e.masterSha256 !== t || ![
		e.epsSha256,
		e.previewSha256,
		e.artworkSha256
	].every((e) => We.test(e))) return !1;
	let { compare: n, proof: r } = e;
	return r?.length === 2 && r[0] === 13200 && r[1] === 18600 && !!n && X(n.ssim, -1, 1) && X(n.meanDeltaE, 0, 140) && X(n.p95DeltaE, 0, 140) && X(n.mae, 0, 255) && X(n.rmse, 0, 255) && X(e.inkCoverage, 0, 400) && Number.isInteger(e.filledPaths);
}
async function Ke(e, t, n) {
	let r = await I(e, t, ["validation.json", ...He.flatMap((e) => [
		Ue(e),
		e + "-proof.jpg",
		e + "-artwork.jpg"
	])]), i = await L(e, t, r["validation.json"], 65536), a = JSON.parse(new TextDecoder().decode(i));
	if (a.proofDpi !== 600 || !/^Ghostscript \d+\.\d+(?:\.\d+)?$/.test(a.renderer) || a.cmykProfile !== "FOGRA39L Coated" || !He.every((e) => Ge(a[e], n[e]))) throw new b("Production evidence did not match the locked artwork or 600 DPI proof.");
	return {
		measured: a,
		ids: r
	};
}
async function qe(e, t) {
	if (await u(e) !== t) throw new b("A production artifact failed its integrity check.");
}
async function Je(e, n, r, i, a, o) {
	let s = Ue(i), l = await L(e, r, a[s], 9999999);
	await qe(l, o.epsSha256);
	let u;
	try {
		u = Ve(l);
	} catch (e) {
		throw new b(e instanceof Error ? e.message : "An EPS did not pass the vector preflight.");
	}
	if (u.paths !== o.filledPaths || o.palette < u.cmykColors || Math.abs(u.maxInk - o.inkCoverage) > .015) throw new b("A rendered EPS did not match its native path and ink measurements.");
	await e.BUCKET.put(t(n) + s, l, { httpMetadata: { contentType: "application/postscript" } });
	for (let [s, l] of [["-proof.jpg", o.previewSha256], ["-artwork.jpg", o.artworkSha256]]) {
		let o = i + s, u = await L(e, r, a[o], 8e6);
		await qe(u, l);
		let d = c(new Uint8Array(u));
		if (!(s === "-artwork.jpg" ? d?.width === 1408 && d?.height === 1984 : d?.width === 900 && d?.height === 1268) || d?.type !== "image/jpeg") throw new b("A downloaded preview did not match the verified artwork dimensions.");
		await e.BUCKET.put(t(n) + o, u, { httpMetadata: { contentType: "image/jpeg" } });
	}
	return {
		...u,
		compare: o.compare,
		proof: o.proof
	};
}
function Ye(e, t, n, r) {
	let i = He.map((e) => {
		let r = t[e], i = n[e];
		return [
			Ue(e),
			"  File bytes: " + r.bytes,
			"  Physical size: 22 x 31 in (558.8 x 787.4 mm)",
			"  BoundingBox: 0 0 1584 2232 pt",
			"  HiResBoundingBox: 0 0 1584.000000 2232.000000 pt",
			"  Format: EPSF 3.0, PostScript Level 2",
			"  Color: native process Cyan, Magenta, Yellow, Black",
			"  Colors: " + r.cmykColors,
			"  Filled paths and editable objects: " + r.paths,
			"  Recorded color/tonal groups: " + r.groups,
			"  Total subpaths: " + r.subpaths,
			"  Compound fills: " + r.compounds,
			"  Cubic commands: " + r.curves,
			"  Straight-line commands: " + r.lines,
			"  Explicit closepath commands: " + r.closes,
			"  Geometry segments (line + cubic + close): " + (r.lines + r.curves + r.closes),
			"  Clipping operations: " + r.clips,
			"  Tone representation: colored vector fills",
			"  Embedded raster objects: " + r.rasters,
			"  Resolution independence: verified native paths",
			"  Total area coverage: " + r.maxInk.toFixed(2) + "%",
			"  600 DPI rendering verified: " + r.proof.join(" x ") + " px",
			"  Luminance SSIM: " + r.compare.ssim,
			"  Delta E 2000 (mean / 95th percentile): " + r.compare.meanDeltaE + " / " + r.compare.p95DeltaE,
			"  RGB MAE / RMSE (0-255): " + i.compare.mae + " / " + i.compare.rmse,
			"  Approved master SHA-256: " + i.masterSha256,
			"  EPS SHA-256: " + i.epsSha256
		].join("\n");
	});
	return [
		"MY JERSEY  |  TECHNICAL REPORT",
		"Run " + e.id,
		"Stage durations are recorded by the production workspace. Time to packaging: " + ((r - (e.started_at ?? e.created_at)) / 1e3).toFixed(1) + " seconds.",
		"Master color: " + n.sourceProfile,
		"Conversion: LittleCMS, media-relative colorimetric with black point compensation and profile-space color refinement.",
		"CMYK profile for this preflight: " + n.cmykProfile,
		"Rendering: " + n.renderer,
		"",
		...i.flatMap((e) => [e, ""]),
		"Color checks compare each rendered EPS with its own canonical RGB artwork. RGB colors outside the CMYK gamut and very fine tonal transitions can differ.",
		"The EPS contains separately painted vector contours and compound paths. Host editor grouping behavior depends on its EPS importer.",
		"Adobe Illustrator import and your final printer ICC profile are outside this preflight.",
		""
	].join("\n");
}
async function Xe(e, n, r, i, a) {
	let o = { "TECHNICAL_REPORT.txt": Ne(Ye(n, {
		front: i,
		back: a
	}, r, Date.now())) };
	for (let r of He) for (let i of [Ue(r), r + "-artwork.jpg"]) {
		let a = await e.BUCKET.get(t(n.id) + i);
		if (!a) throw new b("A validated production file is unavailable for packaging.");
		o[i.endsWith(".jpg") ? r.toUpperCase() + "_ARTWORK.jpg" : i] = [new Uint8Array(await a.arrayBuffer()), { level: +!i.endsWith(".jpg") }];
	}
	let s = Le(o, { level: 1 }), c = t(n.id) + "master.zip";
	return await e.BUCKET.put(c, s, { httpMetadata: { contentType: "application/zip" } }), {
		front: i,
		back: a,
		renderer: r.renderer,
		cmykProfile: r.cmykProfile,
		packageBytes: s.byteLength
	};
}
// worker/workflow.ts
var Z = {
	retries: {
		limit: 0,
		delay: "1 second"
	},
	timeout: "9 minutes"
}, Q = {
	retries: {
		limit: 2,
		delay: "5 seconds",
		backoff: "exponential"
	},
	timeout: "2 minutes"
}, Ze = class extends e {
	async run(e, n) {
		let r = e.payload.id, i = this.env, a = 1, o = async (e, t) => {
			a = e, await n.do("start-" + e, Q, () => m(i, r, e, "running", t));
		}, s = (e, t) => n.do("finish-" + e, Q, () => m(i, r, e, "complete", t));
		try {
			let e = await n.do("load-job", Q, async () => {
				let e = await d(i, r);
				if (!e || e.status === "complete" || e.status === "failed") throw new b("The production job is unavailable.");
				return e;
			}), a = t(r) + "reference";
			await o(1, "Checking the uploaded image and production connection.");
			let c = await n.do("source-preflight", Q, async () => {
				let t = await i.BUCKET.head(a);
				if (!i.OPENAI_API_KEY?.trim()) throw new b("Production connection pending.");
				if (!t || t.customMetadata?.sha256 !== e.source_hash) throw new b("The reference image could not be verified.");
				return await O(i), j(i);
			});
			await s(1, "Verified the uploaded reference and production configuration."), await o(2, "Identifying the jersey body panels in the reference.");
			let l = await n.do("identify-panels", Z, () => D(i, e, a));
			await s(2, l.front && l.back ? "Identified the front and back body panels." : l.front ? "Identified the front panel. The back will follow the visible design language." : "Identified the back panel. The front will follow the visible design language."), await o(3, "Generating flat body artwork from the reference.");
			let u = await n.do("create-front-master", Z, () => k(i, e, "front", a));
			await n.do("publish-front-master", Q, async () => {
				await i.DB.prepare("UPDATE jobs SET front_ready = 1, updated_at = ? WHERE id = ?").bind(Date.now(), r).run();
			});
			let f = await n.do("create-back-master", Z, () => k(i, e, "back", a));
			await n.do("publish-back-master", Q, async () => {
				await i.DB.prepare("UPDATE jobs SET back_ready = 1, updated_at = ? WHERE id = ?").bind(Date.now(), r).run();
			}), await s(3, "Locked the native 2K front and back artwork masters."), await o(4, "Tracing native vector contours from the locked artwork.");
			let p = [];
			for (let e of c) p.push(await n.do("runtime-" + e.name, Q, () => M(i, e)));
			let m = await n.do("mount-front-master", Q, () => N(i, r, "front")), g = await n.do("mount-back-master", Q, () => N(i, r, "back")), _ = await n.do("start-hosted-vectorization", Z, () => F(i, e.mode, [
				...p,
				m,
				g
			])), v = null, y = !1;
			for (let e = 0; e < 144; e++) {
				let t = await n.do("provider-status-" + e, Q, () => ee(i, _));
				if (t.container && (v = t.container), [
					"failed",
					"incomplete",
					"cancelled"
				].includes(t.status)) throw new b("The hosted vectorization ended before it produced verified files.");
				if (t.validating && !y && (await s(4, "Completed tracing the native CMYK paths."), await o(5, "Interpreting the EPS files and checking print proof dimensions."), y = !0), t.status === "completed") {
					if (!v) throw new b("The hosted run ended without a downloadable artifact workspace.");
					break;
				}
				if (e === 143) throw await n.do("cancel-expired-provider-run", Z, async () => {
					try {
						await x(i, "/responses/" + _ + "/cancel", { method: "POST" });
					} catch {}
				}), new b("The hosted production run exceeded its time window.");
				await n.sleep("wait-provider-" + e, "10 seconds");
			}
			if (!v) throw new b("The vectorization workspace is unavailable.");
			let S = v, { measured: C, ids: w } = await n.do("read-render-evidence", Q, () => Ke(i, S, {
				front: u,
				back: f
			}));
			y || (await s(4, "Completed tracing the native CMYK paths."), await o(5, "Independently checking the rendered EPS files and measurements."));
			let T = await n.do("verify-front-eps", Q, () => Je(i, r, S, "front", w, C.front)), E = await n.do("verify-back-eps", Q, () => Je(i, r, S, "back", w, C.back));
			await s(5, "Verified native CMYK paths, zero embedded raster objects, and both 600 DPI proofs."), await o(6, "Building the Master ZIP with both EPS files, both artwork JPGs, and the technical report.");
			let A = await n.do("package-outputs", Q, async () => {
				let e = await d(i, r);
				if (!e) throw new b("The production job is unavailable.");
				return Xe(i, e, C, T, E);
			});
			return await n.do("publish-verified-results", Q, () => h(i, r, A)), await n.do("release-provider-masters", Z, async () => {
				for (let e of [m, g]) try {
					await x(i, "/files/" + e, { method: "DELETE" }, 1e4);
				} catch {
					console.warn("A hosted artwork file could not be deleted after verification", r);
				}
			}), {
				id: r,
				complete: !0
			};
		} catch (e) {
			let t = e instanceof b ? e.message : "Production could not finish. Review the last recorded step and try a new job.";
			return console.warn("Production stopped", r, a, e instanceof Error ? e.name : "unknown"), await n.do("record-production-failure", Q, () => m(i, r, a, "failed", t)), {
				id: r,
				complete: !1
			};
		}
	}
}, Qe = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, $e = {
	"FRONT_BODY.eps": "FRONT_BODY.eps",
	"BACK_BODY.eps": "BACK_BODY.eps",
	"master.zip": "MY_JERSEY_MASTER.zip"
}, et = ["front-proof.jpg", "back-proof.jpg"], tt = ["front-master.png", "back-master.png"], nt = {
	"Cache-Control": "private, no-store",
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "same-origin",
	"Cross-Origin-Resource-Policy": "same-origin"
}, rt = (e, t = 200) => Response.json(e, {
	status: t,
	headers: nt
}), $ = (e, t) => rt({ error: e }, t);
async function it(e, n, r) {
	if (e.headers.get("Origin") !== new URL(e.url).origin || e.headers.get("Sec-Fetch-Site") === "cross-site") return $("Use the production workspace to start a job.", 403);
	if (!n.OPENAI_API_KEY?.trim()) return $("Production connection pending.", 503);
	try {
		await Promise.all([j(n), O(n)]);
	} catch {
		return $("Production setup is incomplete.", 503);
	}
	let i = e.headers.get("Idempotency-Key")?.toLowerCase() ?? "";
	if (!Qe.test(i)) return $("The production request is missing a valid job ID.", 400);
	let a = Number(e.headers.get("Content-Length"));
	if (Number.isFinite(a) && a > 10048e3) return $("Reference images must be 10 MB or smaller.", 413);
	if (!(e.headers.get("Content-Type") ?? "").startsWith("multipart/form-data;")) return $("Upload a reference image to continue.", 415);
	let o;
	try {
		o = await e.formData();
	} catch {
		return $("The reference upload could not be read.", 400);
	}
	let s = o.get("reference"), l = o.get("mode");
	if (!(s instanceof File) || !s.size || s.size > 1e7) return $("Choose a JPG, PNG or WebP image up to 10 MB.", 400);
	if (l !== "standard" && l !== "fast") return $("Choose Standard or Fast production mode.", 400);
	let f = new Uint8Array(await s.arrayBuffer()), h = c(f);
	if (!h || h.width < 32 || h.height < 32 || h.width * h.height > 49e6) return $("Choose a usable JPG, PNG or WebP image between 32 px per side and 49 megapixels.", 400);
	let g = await u(f), _ = s.name.replace(/[\\/\u0000-\u001f\u007f]/g, " ").trim().slice(0, 160) || "Jersey reference", v = Date.now();
	if (!(await n.DB.prepare("INSERT INTO jobs (id, owner, name, source_type, source_hash, mode, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?) ON CONFLICT(id) DO NOTHING").bind(i, r, _, h.type, g, l, v, v).run()).meta.changes) {
		let e = await d(n, i);
		return !e || e.owner !== r || e.source_hash !== g || e.mode !== l ? $("That production request ID is already in use.", 409) : rt(await p(n, e), 200);
	}
	try {
		await n.BUCKET.put(t(i) + "reference", f, {
			onlyIf: { etagDoesNotMatch: "*" },
			customMetadata: { sha256: g },
			httpMetadata: { contentType: h.type }
		}), await n.PRODUCTION.create({
			id: i,
			params: { id: i }
		});
	} catch (e) {
		try {
			let t = await (await n.PRODUCTION.get(i)).status();
			if (!t || t.status === "unknown") throw e;
		} catch {
			await m(n, i, 1, "failed", "The production workspace could not queue this request.");
		}
	}
	let y = await d(n, i);
	return y ? rt(await p(n, y), 202) : $("The production job could not be retrieved.", 500);
}
async function at(e, n, r) {
	let i = tt.includes(r) && (r.startsWith("front") ? n.front_ready : n.back_ready), a = n.status === "complete" && (Object.hasOwn($e, r) || et.includes(r));
	if (!i && !a) return $("This production file is not available.", 404);
	let o = await e.BUCKET.get(t(n.id) + r);
	if (!o) return $("This production file is not available.", 404);
	let s = new Headers(nt);
	return o.writeHttpMetadata(s), s.set("Content-Length", String(o.size)), Object.hasOwn($e, r) && s.set("Content-Disposition", "attachment; filename=\"" + $e[r] + "\""), new Response(o.body, { headers: s });
}
async function ot(e, t, n) {
	let r = await o(e, t);
	if (e.method === "GET" && n.pathname === "/api/workspace") {
		let e = !!t.OPENAI_API_KEY?.trim() && !!t.STUDIO_ARTWORK_PROMPT?.trim() && (!!r?.local || !!t.CF_ACCESS_TEAM_DOMAIN && !!t.CF_ACCESS_AUD), n = !!r && e && await Promise.all([j(t), O(t)]).then(() => !0, () => !1);
		return rt({
			available: n,
			setupPending: !e || !!r && !n,
			signedIn: !!r,
			deviceWorkspace: r?.local ?? !1,
			email: r?.email ?? null
		});
	}
	if (!r) return $("Sign in to your production workspace.", 401);
	if (n.pathname === "/api/jobs") {
		if (e.method === "POST") return it(e, t, r.owner);
		if (e.method === "GET") {
			let { results: e } = await t.DB.prepare("SELECT * FROM jobs WHERE owner = ? ORDER BY created_at DESC LIMIT 60").bind(r.owner).all();
			return rt(e.map((e) => f(e)));
		}
		return $("Method unavailable.", 405);
	}
	let i = /^\/api\/jobs\/([\w-]+)(?:\/files\/([\w.-]+))?$/.exec(n.pathname);
	if (e.method !== "GET" || !i || !Qe.test(i[1])) return $("Resource unavailable.", 404);
	let a = await d(t, i[1]);
	return !a || a.owner !== r.owner ? $("This production job is not available.", 404) : i[2] ? at(t, a, i[2]) : rt(await p(t, a));
}
var st = { async fetch(e, t) {
	let n = new URL(e.url);
	if (n.pathname === "/_pipeline" || n.pathname.startsWith("/_pipeline/")) return new Response(null, { status: 404 });
	if (!n.pathname.startsWith("/api/")) return t.ASSETS.fetch(e);
	try {
		return await ot(e, t, n);
	} catch (e) {
		return console.error("Workspace request failed", e instanceof Error ? e.name : "unknown"), $("The production workspace could not complete this request.", 500);
	}
} };
export { Ze as JerseyProduction, st as default };
