export interface Identity { owner: string; email: string | null; local: boolean }
export interface IdentityEnv { CF_ACCESS_TEAM_DOMAIN?: string; CF_ACCESS_AUD?: string; MYJERSEY_LOCAL?: string }

type JsonWithKid = JsonWebKey & { kid?: string };
const cachedKeys = new Map<string, { until: number; keys: JsonWithKid[] }>();
const decode = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
const readJSON = <T>(s: string) => JSON.parse(new TextDecoder().decode(decode(s))) as T;

async function lookupKey(issuer: string, kid: string) {
  const cached = cachedKeys.get(issuer);
  const key = cached?.until && cached.until > Date.now() ? cached.keys.find(key => key.kid === kid) : undefined;
  if (key) return key;
  const response = await fetch(issuer + "/cdn-cgi/access/certs", { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) return undefined;
  const { keys } = await response.json<{ keys: JsonWithKid[] }>();
  cachedKeys.set(issuer, { keys, until: Date.now() + 300_000 });
  return keys.find(key => key.kid === kid);
}

export async function identity(request: Request, env: IdentityEnv): Promise<Identity | null> {
  const url = new URL(request.url);
  if (env.MYJERSEY_LOCAL === "1" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    return { owner: "development-local", email: null, local: true };
  }
  const domain = env.CF_ACCESS_TEAM_DOMAIN?.trim().replace(/^https:\/\//, "").replace(/\/$/, "");
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!domain || !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain) || !env.CF_ACCESS_AUD || !token || token.length > 8192) return null;
  try {
    const issuer = "https://" + domain;
    const segments = token.split(".");
    if (segments.length !== 3) return null;
    const [head, body, signature] = segments;
    const header = readJSON<{ alg: string; kid?: string }>(head);
    const claims = readJSON<{ iss: string; exp: number; nbf?: number; aud: string[] | string; sub?: string; email?: string }>(body);
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== "RS256" || !header.kid || claims.iss !== issuer || !(claims.exp > now) ||
        (claims.nbf ?? 0) > now || !claims.sub || ![claims.aud].flat().includes(env.CF_ACCESS_AUD)) return null;
    const jwk = await lookupKey(issuer, header.kid);
    if (!jwk) return null;
    const algorithm = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
    const publicKey = await crypto.subtle.importKey("jwk", jwk, algorithm, false, ["verify"]);
    const valid = await crypto.subtle.verify(algorithm, publicKey, decode(signature), new TextEncoder().encode(head + "." + body));
    return valid ? { owner: claims.sub, email: claims.email ?? null, local: false } : null;
  } catch {
    return null;
  }
}
