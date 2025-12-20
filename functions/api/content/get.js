function json(body, status=200){
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || "";
  if(!key) return json({ error: "Chave ausente." }, 400);

  // Usa o mesmo KV do site (binding CAMPAIGNS_KV)
  const kvKey = `content:${key}`;
  const value = await env.CAMPAIGNS_KV?.get(kvKey);
  return json({ ok: true, key, value: value || "" });
}
