/**
 * GET /api/image?key=<object key>&exp=<unix seconds>&sig=<hmac>
 *
 * Serves a private R2 photo only when the request carries a valid HMAC
 * signature that has not expired. Links are generated server-side by
 * /api/contact (for the owner email) and /api/submissions (for the admin
 * dashboard), so the bucket itself never needs to be public.
 *
 * The signature covers "<key>\n<exp>" with the IMAGE_SIGNING_KEY secret.
 */

const KEY_PATTERN = /^estimates\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp|heic|heif)$/;

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);
    const key = url.searchParams.get("key") || "";
    const exp = Number.parseInt(url.searchParams.get("exp") || "0", 10);
    const sig = (url.searchParams.get("sig") || "").toLowerCase();

    if (!KEY_PATTERN.test(key)) return text("Invalid image link.", 400);
    if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) {
      return text("This image link has expired. Please contact us for a new copy.", 403);
    }
    if (!env.IMAGE_SIGNING_KEY) return text("Image links are not configured.", 500);

    const expected = await hmacHex(env.IMAGE_SIGNING_KEY, `${key}\n${exp}`);
    if (!safeEqual(expected, sig)) return text("Invalid image link.", 403);

    if (!env.UPLOADS) return text("Photo storage is not configured.", 500);

    const object = await env.UPLOADS.get(key);
    if (!object) return text("Image not found.", 404);

    return new Response(object.body, {
      headers: {
        "content-type": object.httpMetadata?.contentType || "application/octet-stream",
        "cache-control": "private, max-age=3600",
        "content-disposition": `inline; filename="${key.split("/").pop()}"`
      }
    });
  } catch (error) {
    console.error("image serve failed", error);
    return text("Unexpected server error.", 500);
  }
}

export async function onRequestHead(context) {
  const response = await onRequestGet(context);
  return new Response(null, { status: response.status, headers: response.headers });
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

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function text(message, status = 200) {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" }
  });
}
