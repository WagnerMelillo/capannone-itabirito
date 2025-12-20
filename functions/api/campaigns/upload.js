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

  const form = await request.formData().catch(() => null);
  if (!form) return json({ error: "Form inválido." }, 400);

  const file = form.get("file");
  const title = (form.get("title") || "").toString().slice(0, 60);

  if (!file || typeof file === "string") return json({ error: "Arquivo ausente." }, 400);
  if (!file.type?.startsWith("image/")) return json({ error: "Envie apenas imagem." }, 400);

  const ext = (file.name?.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g,"");
  const key = `campaign-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
  const buf = await file.arrayBuffer();

  await env.CAMPAIGNS_BUCKET.put(key, buf, {
    httpMetadata: { contentType: file.type }
  });

  const raw = await env.CAMPAIGNS_KV.get("campaigns");
  const items = raw ? JSON.parse(raw) : [];
  const item = { key, title, uploadedAt: new Date().toISOString(), url: `/campaigns/${key}` };
  items.unshift(item);
  await env.CAMPAIGNS_KV.put("campaigns", JSON.stringify(items));

  return json({ ok: true, item });
}