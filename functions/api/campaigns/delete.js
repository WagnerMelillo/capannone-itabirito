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
  if (!expected || !env.CAMPAIGNS_BUCKET || !env.CAMPAIGNS_KV) {
    return json({ error: "Serviço não configurado." }, 503);
  }

  const pin = request.headers.get("X-Admin-Pin") || "";
  if (!(await secureEqual(pin, expected))) return json({ error: "Não autorizado." }, 401);

  const { key } = await request.json().catch(() => ({}));
  const safeKey = String(key || "");
  if (!/^[a-z0-9][a-z0-9._-]{0,180}$/i.test(safeKey)) return json({ error: "Identificador inválido." }, 400);

  await env.CAMPAIGNS_BUCKET.delete(safeKey);
  const raw = await env.CAMPAIGNS_KV.get("campaigns");
  const stored = raw ? JSON.parse(raw) : [];
  const items = Array.isArray(stored) ? stored : [];
  await env.CAMPAIGNS_KV.put("campaigns", JSON.stringify(items.filter((item) => item?.key !== safeKey)));
  return json({ ok: true });
}
