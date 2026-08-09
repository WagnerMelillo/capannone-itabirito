export async function onRequest({ params, env }) {
  const key = String(params.key || "");
  if (!/^[a-z0-9][a-z0-9._-]{0,180}$/i.test(key) || !env.CAMPAIGNS_BUCKET) {
    return new Response("Not found", { status: 404 });
  }

  const obj = await env.CAMPAIGNS_BUCKET.get(key);
  if (!obj) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(obj.body, { headers });
}
