export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/x-www-form-urlencoded") && !contentType.includes("multipart/form-data")) {
      return json({ ok: false, error: "Unsupported content type." }, 415);
    }

    const formData = await request.formData();

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

    const toEmail = env.CONTACT_EMAIL;
    if (!toEmail) {
      return json({ ok: false, error: "Server is missing CONTACT_EMAIL." }, 500);
    }

    const fromEmail = env.FROM_EMAIL || "no-reply@dovesdent.com";
    const sourcePage = request.headers.get("referer") || "Unknown";

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
      `Source Page: ${sourcePage}`,
      `Submitted: ${new Date().toISOString()}`
    ];

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

    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, error: "Unexpected server error." }, 500);
  }
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
