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

  const { key, value } = await request.json().catch(() => ({}));
  if(!key) return json({ error: "Chave ausente." }, 400);

  const kvKey = `content:${key}`;
  await env.CAMPAIGNS_KV?.put(kvKey, String(value ?? ""));
  return json({ ok: true, key });
}
