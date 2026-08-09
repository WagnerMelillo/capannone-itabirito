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

  const form = await request.formData().catch(() => null);
  if (!form) return json({ error: "Formulário inválido." }, 400);

  const file = form.get("image") || form.get("file");
  const title = String(form.get("title") || "").trim().slice(0, 80);
  const description = String(form.get("description") || "").trim().slice(0, 500);
  if (!title) return json({ error: "Título ausente." }, 400);
  if (!file || typeof file === "string") return json({ error: "Imagem ausente." }, 400);

  const extensions = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
  };
  const extension = extensions[file.type];
  if (!extension) return json({ error: "Use uma imagem JPG, PNG ou WebP." }, 415);
  if (file.size <= 0 || file.size > 5 * 1024 * 1024) return json({ error: "Use uma imagem de até 5 MB." }, 413);

  const key = `campaign-${Date.now()}-${crypto.randomUUID()}.${extension}`;
  await env.CAMPAIGNS_BUCKET.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type }
  });

  try {
    const raw = await env.CAMPAIGNS_KV.get("campaigns");
    const stored = raw ? JSON.parse(raw) : [];
    const items = Array.isArray(stored) ? stored : [];
    const item = {
      key,
      id: key,
      title,
      description,
      uploadedAt: new Date().toISOString(),
      url: `/campaigns/${encodeURIComponent(key)}`,
      imageUrl: `/campaigns/${encodeURIComponent(key)}`
    };
    await env.CAMPAIGNS_KV.put("campaigns", JSON.stringify([item, ...items].slice(0, 100)));
    return json({ ok: true, item });
  } catch (error) {
    await env.CAMPAIGNS_BUCKET.delete(key).catch(() => {});
    return json({ error: "Não foi possível salvar a campanha." }, 500);
  }
}
