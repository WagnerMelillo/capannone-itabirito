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

export async function onRequestGet({ request, env }) {
  const key = new URL(request.url).searchParams.get("key") || "";
  if (key !== "history") return json({ error: "Chave inválida." }, 400);
  const value = await env.CAMPAIGNS_KV?.get("content:history");
  return json({ ok: true, key, value: value || "" });
}
