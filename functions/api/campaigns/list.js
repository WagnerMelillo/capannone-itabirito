export async function onRequestGet({ env }) {
  let items = [];
  try {
    const raw = await env.CAMPAIGNS_KV?.get("campaigns");
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) items = parsed.slice(0, 100);
  } catch (_) {}

  return new Response(JSON.stringify({ items }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
