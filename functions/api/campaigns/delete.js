function json(body, status=200){
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

export async function onRequestPost({ request, env }) {
  const pin = request.headers.get("X-Admin-Pin") || "";
  const expected = env.ADMIN_PIN || "0502";
  if (String(pin) !== String(expected)) return json({ error: "Não autorizado." }, 401);

  const { key } = await request.json().catch(() => ({}));
  if (!key) return json({ error: "Key ausente." }, 400);

  await env.CAMPAIGNS_BUCKET.delete(key);

  const raw = await env.CAMPAIGNS_KV.get("campaigns");
  const items = raw ? JSON.parse(raw) : [];
  const next = items.filter(it => it.key !== key);
  await env.CAMPAIGNS_KV.put("campaigns", JSON.stringify(next));

  return json({ ok: true });
}