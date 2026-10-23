/**
 * POST /api/upload
 *
 * Accepts a single image (multipart/form-data, field "file"), validates it,
 * stores it in the R2 bucket bound as `UPLOADS`, and returns the object key.
 *
 * The browser uploads one photo per request and then submits the collected
 * keys with the contact form. This keeps every request small (well under the
 * Workers/Pages request-size limit) and avoids needing S3 credentials or
 * bucket CORS, which presigned direct-to-R2 uploads would require.
 *
 * Nothing here is public: the bucket stays private and images are only served
 * through /api/image with a signed, expiring link.
 */

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env.UPLOADS) {
      return json({ ok: false, error: "Photo storage is not configured." }, 500);
    }

    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    const maxFiles = parsePositiveInt(env.UPLOAD_MAX_FILES, 8);
    const limited = await bumpRateLimit(ip, maxFiles);
    if (limited) {
      return json({ ok: false, error: "Too many uploads. Please wait a minute and try again." }, 429);
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return json({ ok: false, error: "Unsupported content type." }, 415);
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!isFile(file)) {
      return json({ ok: false, error: "No photo was received." }, 400);
    }

    const maxBytes = parsePositiveInt(env.UPLOAD_MAX_BYTES, 8 * 1024 * 1024);
    if (file.size === 0) {
      return json({ ok: false, error: "That photo appears to be empty." }, 400);
    }
    if (file.size > maxBytes) {
      return json(
        { ok: false, error: `Each photo must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.` },
        413
      );
    }

    // Trust the bytes, not the browser-provided MIME type.
    const detected = await detectImageType(file);
    if (!detected) {
      return json({ ok: false, error: "Please upload a JPEG, PNG, WebP, or HEIC photo." }, 415);
    }
    if (!ALLOWED.has(detected.mime)) {
      return json({ ok: false, error: "That image type is not supported." }, 415);
    }

    const key = buildKey(detected.ext);
    await env.UPLOADS.put(key, file, {
      httpMetadata: {
        contentType: detected.mime,
        cacheControl: "private, max-age=0"
      },
      customMetadata: {
        originalName: sanitizeName(file.name),
        uploadedAt: new Date().toISOString()
      }
    });

    return json({ ok: true, key });
  } catch (error) {
    console.error("upload failed", error);
    return json({ ok: false, error: "Unexpected server error." }, 500);
  }
}

// Count uploads per IP per minute. A single submission uploads up to
// UPLOAD_MAX_FILES photos, so the cap allows one full submission per minute.
async function bumpRateLimit(ip, maxFiles) {
  const minute = Math.floor(Date.now() / 60000);
  const req = new Request(`https://rate-limit.dovesdent.local/upload/${encodeURIComponent(ip)}/${minute}`);
  const existing = await caches.default.match(req);
  const count = existing ? Number(await existing.text()) || 0 : 0;
  if (count >= maxFiles) return true;

  await caches.default.put(
    req,
    new Response(String(count + 1), { headers: { "cache-control": "max-age=120" } })
  );
  return false;
}

async function detectImageType(file) {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());

  // JPEG: FF D8 FF
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return { ext: "jpg", mime: "image/jpeg" };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 &&
    head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a
  ) {
    return { ext: "png", mime: "image/png" };
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
    head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50
  ) {
    return { ext: "webp", mime: "image/webp" };
  }

  // HEIC/HEIF: box "ftyp" at offset 4, then a brand
  if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) {
    const brand = String.fromCharCode(head[8], head[9], head[10], head[11]).toLowerCase();
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand)) {
      const isHeif = brand === "mif1" || brand === "msf1";
      return { ext: isHeif ? "heif" : "heic", mime: isHeif ? "image/heif" : "image/heic" };
    }
  }

  return null;
}

function buildKey(ext) {
  const day = new Date().toISOString().slice(0, 10);
  const id = crypto.randomUUID();
  return `estimates/${day}/${id}.${ext}`;
}

function isFile(value) {
  return typeof value === "object" && value !== null && typeof value.size === "number" && typeof value.name === "string";
}

function sanitizeName(name) {
  const base = String(name || "").split(/[\\/]/).pop() || "photo";
  return base.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
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
