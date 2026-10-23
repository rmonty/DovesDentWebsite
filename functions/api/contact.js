/**
 * POST /api/contact
 *
 * Receives the inspection-request form, validates it, stores the submission in
 * KV (for the owner dashboard), and emails it through MailChannels.
 *
 * Photos are uploaded separately to R2 via /api/upload; the form carries their
 * object keys as JSON in the "imageKeys" field. Each key is checked against a
 * strict pattern and confirmed to exist before it is trusted.
 */

const IMAGE_KEY_PATTERN = /^estimates\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp|heic|heif)$/;

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/x-www-form-urlencoded") && !contentType.includes("multipart/form-data")) {
      return json({ ok: false, error: "Unsupported content type." }, 415);
    }

    const formData = await request.formData();

    const honeypot = sanitize(formData.get("companyWebsite"));
    if (honeypot) {
      // Pretend success for bots so they do not probe validation logic.
      return json({ ok: true });
    }

    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    const rateLimitSeconds = parsePositiveInt(env.RATE_LIMIT_SECONDS, 30);
    const rateLimitKey = new Request(`https://rate-limit.dovesdent.local/${encodeURIComponent(ip)}`);
    const existingLock = await caches.default.match(rateLimitKey);
    if (existingLock) {
      return json({ ok: false, error: "Please wait a few seconds before sending another request." }, 429);
    }

    const firstName = sanitize(formData.get("fname"));
    const lastName = sanitize(formData.get("lname"));
    const phone = sanitize(formData.get("phone"));
    const email = sanitize(formData.get("email"));
    const vehicle = sanitize(formData.get("vehicle"));
    const damage = sanitize(formData.get("damage"));
    const insured = sanitize(formData.get("insured"));
    const preferred = sanitize(formData.get("preferred"));
    const notes = sanitize(formData.get("notes"));

    if (!firstName || !lastName || !phone || !damage) {
      return json({ ok: false, error: "Missing required fields." }, 400);
    }

    const imageKeys = await collectImageKeys(formData.get("imageKeys"), env);

    const toEmail = env.CONTACT_EMAIL;
    if (!toEmail) {
      return json({ ok: false, error: "Server is missing CONTACT_EMAIL." }, 500);
    }

    const fromEmail = env.FROM_EMAIL || "no-reply@dovesdent.com";
    const sourcePage = request.headers.get("referer") || "Unknown";
    const origin = new URL(request.url).origin;

    const imageLinks = await signImageLinks(imageKeys, env, origin);

    const subject = `New Inspection Request - ${firstName} ${lastName}`;
    const lines = [
      "New inspection request received:",
      "",
      `Name: ${firstName} ${lastName}`,
      `Phone: ${phone}`,
      `Email: ${email || "Not provided"}`,
      `Vehicle: ${vehicle || "Not provided"}`,
      `Damage Type: ${damage}`,
      `Insurance: ${insured || "Not provided"}`,
      `Preferred Time: ${preferred || "Not provided"}`,
      `Notes: ${notes || "Not provided"}`,
      `Photos: ${imageKeys.length} attached`,
      `Source Page: ${sourcePage}`,
      `Submitted: ${new Date().toISOString()}`
    ];

    if (imageLinks.length > 0) {
      lines.push("", "Photos (links expire):");
      for (const link of imageLinks) lines.push(`- ${link}`);
    } else if (imageKeys.length > 0) {
      lines.push("", "Photos were received but view links are unavailable (IMAGE_SIGNING_KEY is not set).");
    }

    const mailPayload = {
      personalizations: [
        {
          to: [{ email: toEmail }],
          subject
        }
      ],
      from: {
        email: fromEmail,
        name: "Doves Dent Website"
      },
      reply_to: email ? { email } : { email: fromEmail },
      content: [
        {
          type: "text/plain",
          value: lines.join("\n")
        }
      ]
    };

    const mailResponse = await fetch("https://api.mailchannels.net/tx/v1/send", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(mailPayload)
    });

    if (!mailResponse.ok) {
      const details = await mailResponse.text();
      return json({ ok: false, error: "Email send failed.", details }, 502);
    }

    try {
      await storeSubmission(env, {
        firstName,
        lastName,
        phone,
        email,
        vehicle,
        damage,
        insured,
        preferred,
        notes,
        sourcePage,
        imageKeys
      });
    } catch (error) {
      // The email already went out; a storage failure should not fail the request.
      console.error("submission store failed", error);
    }

    await caches.default.put(
      rateLimitKey,
      new Response("sent", {
        headers: {
          "cache-control": `max-age=${rateLimitSeconds}`
        }
      })
    );

    return json({ ok: true });
  } catch (error) {
    console.error("contact failed", error);
    return json({ ok: false, error: "Unexpected server error." }, 500);
  }
}

async function collectImageKeys(raw, env) {
  if (typeof raw !== "string" || !raw.trim()) return [];

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const maxFiles = parsePositiveInt(env.UPLOAD_MAX_FILES, 8);
  const keys = [];
  for (const value of parsed.slice(0, maxFiles)) {
    if (typeof value !== "string" || !IMAGE_KEY_PATTERN.test(value)) continue;
    if (keys.includes(value)) continue;
    if (env.UPLOADS) {
      const object = await env.UPLOADS.head(value);
      if (!object) continue;
    }
    keys.push(value);
  }
  return keys;
}

async function signImageLinks(keys, env, origin) {
  if (!env.IMAGE_SIGNING_KEY || keys.length === 0) return [];

  const ttl = parsePositiveInt(env.IMAGE_LINK_TTL_SECONDS, 30 * 24 * 60 * 60);
  const links = [];
  for (const key of keys) {
    const exp = Math.floor(Date.now() / 1000) + ttl;
    const sig = await hmacHex(env.IMAGE_SIGNING_KEY, `${key}\n${exp}`);
    links.push(`${origin}/api/image?key=${encodeURIComponent(key)}&exp=${exp}&sig=${sig}`);
  }
  return links;
}

async function storeSubmission(env, data) {
  if (!env.SUBMISSIONS) return;

  const now = new Date();
  const id = `${now.toISOString()}-${crypto.randomUUID()}`;
  const ttl = parsePositiveInt(env.SUBMISSION_TTL_SECONDS, 90 * 24 * 60 * 60);

  const record = {
    id,
    createdAt: now.toISOString(),
    name: `${data.firstName} ${data.lastName}`,
    phone: data.phone,
    email: data.email,
    vehicle: data.vehicle,
    damage: data.damage,
    insured: data.insured,
    preferred: data.preferred,
    notes: data.notes,
    sourcePage: data.sourcePage,
    imageKeys: data.imageKeys
  };

  await env.SUBMISSIONS.put(`submissions/${id}`, JSON.stringify(record), {
    expirationTtl: Math.max(60, ttl)
  });
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

function sanitize(value) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 2000);
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}
