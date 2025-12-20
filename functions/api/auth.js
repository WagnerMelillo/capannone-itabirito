export async function onRequestPost({ request, env }) {
  const { pin } = await request.json().catch(() => ({}));
  const expected = env.ADMIN_PIN || "0502";
  const ok = String(pin || "") === String(expected);
  return new Response(JSON.stringify({ ok }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}