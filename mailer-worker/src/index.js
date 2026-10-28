/**
 * Private mail relay. Only reachable through the MAILER service binding on the
 * Pages project (no workers.dev URL, no routes).
 *
 * POST JSON { from, to, subject, text, replyTo? } -> { ok, messageId } or { ok: false, code, message }
 */
export default {
  async fetch(request, env) {
    if (request.method !== "POST") return reply({ ok: false, message: "POST only" }, 405);

    let body;
    try {
      body = await request.json();
    } catch {
      return reply({ ok: false, message: "Invalid JSON" }, 400);
    }

    const { from, to, subject, text, replyTo } = body || {};
    if (!from || !to || !subject || !text) {
      return reply({ ok: false, message: "from, to, subject and text are required" }, 400);
    }

    try {
      const message = { from, to, subject, text };
      if (replyTo) message.replyTo = replyTo;
      const result = await env.EMAIL.send(message);
      return reply({ ok: true, messageId: result && result.messageId });
    } catch (error) {
      console.error("send failed", error && error.code, error && error.message);
      return reply({ ok: false, code: error && error.code, message: (error && error.message) || "Send failed" }, 502);
    }
  }
};

function reply(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}
