export async function onRequestGet({ env }) {
  const raw = await env.CAMPAIGNS_KV?.get("campaigns");
  const items = raw ? JSON.parse(raw) : [];
  return new Response(JSON.stringify({ items }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}