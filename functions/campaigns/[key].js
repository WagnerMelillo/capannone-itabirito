export async function onRequest({ params, env }) {
  const key = params.key;
  if (!key) return new Response("Not found", { status: 404 });

  const obj = await env.CAMPAIGNS_BUCKET.get(key);
  if (!obj) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(obj.body, { headers });
}