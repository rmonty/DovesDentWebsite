/**
 * GET /api/submissions
 *
 * Returns recent inspection requests for the owner dashboard. Requires a
 * Firebase ID token in "Authorization: Bearer <token>" belonging to an email
 * listed in the ADMIN_EMAILS environment variable.
 *
 * Submissions are stored as JSON in the KV namespace bound as `SUBMISSIONS`
 * (with a TTL). Each one is returned with fresh, signed image URLs.
 */

const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    if (!env.SUBMISSIONS) {
      return json({ ok: false, error: "Submissions storage is not configured." }, 500);
    }

    const token = bearerToken(request);
    if (!token) return json({ ok: false, error: "Sign in required." }, 401);

    const claims = await verifyFirebaseToken(token, env);
    if (!claims) return json({ ok: false, error: "Invalid or expired session." }, 401);

    const admins = adminEmails(env);
    if (admins.length === 0) {
      return json({ ok: false, error: "ADMIN_EMAILS is not configured." }, 500);
    }
    const email = String(claims.email || "").toLowerCase();
    if (!admins.includes(email)) {
      return json({ ok: false, error: "This account is not authorized." }, 403);
    }

    const list = await env.SUBMISSIONS.list({ prefix: "submissions/", limit: 100 });
    const keys = list.keys.map((k) => k.name).sort().reverse();

    const submissions = [];
    for (const key of keys) {
      const record = await env.SUBMISSIONS.get(key, "json");
      if (!record) continue;
      submissions.push(await decorate(record, env));
    }

    return json({ ok: true, count: submissions.length, submissions });
  } catch (error) {
    console.error("submissions failed", error);
    return json({ ok: false, error: "Unexpected server error." }, 500);
  }
}

async function decorate(record, env) {
  const imageKeys = Array.isArray(record.imageKeys) ? record.imageKeys : [];
  const images = [];
  for (const key of imageKeys) {
    if (!/^estimates\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp|heic|heif)$/.test(key)) continue;
    if (!env.IMAGE_SIGNING_KEY) break;
    const exp = Math.floor(Date.now() / 1000) + parsePositiveInt(env.IMAGE_LINK_TTL_SECONDS, 30 * 24 * 60 * 60);
    const sig = await hmacHex(env.IMAGE_SIGNING_KEY, `${key}\n${exp}`);
    images.push({ key, url: `/api/image?key=${encodeURIComponent(key)}&exp=${exp}&sig=${sig}` });
  }

  return {
    id: record.id,
    createdAt: record.createdAt,
    name: record.name,
    phone: record.phone,
    email: record.email,
    vehicle: record.vehicle,
    damage: record.damage,
    insured: record.insured,
    preferred: record.preferred,
    notes: record.notes,
    sourcePage: record.sourcePage,
    images
  };
}

async function verifyFirebaseToken(idToken, env) {
  const projectId = env.FIREBASE_PROJECT_ID;
  if (!projectId) return null;

  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  let header;
  let payload;
  try {
    header = JSON.parse(b64urlToString(encodedHeader));
    payload = JSON.parse(b64urlToString(encodedPayload));
  } catch {
    return null;
  }

  if (!header || header.alg !== "RS256" || !header.kid) return null;

  let jwk = await findKey(header.kid);
  if (!jwk) jwk = await findKey(header.kid, true);
  if (!jwk) return null;

  let verified = false;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    verified = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      b64urlToBytes(encodedSignature),
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
    );
  } catch {
    return null;
  }
  if (!verified) return null;

  const now = Math.floor(Date.now() / 1000);
  if (!(payload.exp > now)) return null;
  if (!(payload.iat <= now + 60)) return null;
  if (payload.aud !== projectId) return null;
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;

  return payload;
}

async function findKey(kid, force = false) {
  const jwks = await getJwks(force);
  return (jwks.keys || []).find((k) => k.kid === kid) || null;
}

async function getJwks(force = false) {
  const cacheKey = new Request("https://keys.dovesdent.local/firebase-jwks");
  if (!force) {
    const cached = await caches.default.match(cacheKey);
    if (cached) return cached.json();
  }

  const response = await fetch(JWKS_URL);
  if (!response.ok) return { keys: [] };
  const data = await response.json();
  const ttl = parseMaxAge(response.headers.get("cache-control")) || 3600;

  await caches.default.put(
    cacheKey,
    new Response(JSON.stringify(data), { headers: { "cache-control": `max-age=${ttl}` } })
  );
  return data;
}

function parseMaxAge(cacheControl) {
  const match = /max-age=(\d+)/i.exec(cacheControl || "");
  return match ? Number(match[1]) : 0;
}

function bearerToken(request) {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : "";
}

function adminEmails(env) {
  return String(env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function b64urlToBytes(input) {
  const base64 = String(input).replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function b64urlToString(input) {
  return new TextDecoder().decode(b64urlToBytes(input));
}

async function hmacHex(secret, message) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parsePositiveInt(value, fallback) {
  const n = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
