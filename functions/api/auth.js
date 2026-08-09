function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

async function secureEqual(value, expected) {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(value)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected))
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

export async function onRequestPost({ request, env }) {
  const expected = typeof env.ADMIN_PIN === "string" ? env.ADMIN_PIN.trim() : "";
  if (!expected) return json({ error: "Serviço não configurado." }, 503);

  const { pin } = await request.json().catch(() => ({}));
  const value = String(pin || "");
  if (!value || value.length > 128) return json({ ok: false }, 400);

  const ok = await secureEqual(value, expected);
  return json({ ok });
}
