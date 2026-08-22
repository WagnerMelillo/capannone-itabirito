const PROJECT_ID = "capannone-itabirito";
const SUPERADMIN_UID = "n7YwMAtBWrZmQUkTwfDQr5mnQsB2";
const MAGNA_EMAIL = "magnamelillo@gmail.com";
const TOKEN_ISSUER = `https://securetoken.google.com/${PROJECT_ID}`;
const FIREBASE_JWKS = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const FIRESTORE_USERS = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users`;
const FIRESTORE_EMPLOYEES = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/employees`;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
const MAX_REQUEST_BYTES = 22 * 1024 * 1024;
const ALLOWED_PURPOSES = new Set(["site-hero", "site-history", "site-events", "product-image", "product-video", "campaign-image", "gallery-image"]);

function allowedOrigin(origin) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return false;
    return url.hostname === "capannone.dasmmelhores.com"
      || url.hostname === "www.capannone.dasmmelhores.com"
      || url.hostname === "capannone-itabirito.pages.dev"
      || url.hostname.endsWith(".capannone-itabirito.pages.dev")
      || url.hostname === "localhost"
      || url.hostname === "127.0.0.1";
  } catch (_) {
    return false;
  }
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const headers = {
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, HEAD, POST, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  };
  if (origin && allowedOrigin(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(request, body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...corsHeaders(request), ...extraHeaders }
  });
}

function fail(request, message, status = 400) {
  return json(request, { error: message }, status);
}

function base64UrlBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function parseJwtPart(value) {
  return JSON.parse(new TextDecoder().decode(base64UrlBytes(value)));
}

async function verifyFirebaseToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("invalid-token");
  const header = parseJwtPart(parts[0]);
  const payload = parseJwtPart(parts[1]);
  if (header.alg !== "RS256" || !header.kid) throw new Error("invalid-token");
  const response = await fetch(FIREBASE_JWKS, { cf: { cacheEverything: true, cacheTtl: 3600 } });
  if (!response.ok) throw new Error("key-service-unavailable");
  const document = await response.json();
  const keys = Array.isArray(document.keys) ? document.keys : Object.entries(document).map(([kid, value]) => ({ kid, ...value }));
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) throw new Error("unknown-key");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const verified = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64UrlBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  const now = Math.floor(Date.now() / 1000);
  if (!verified
    || payload.aud !== PROJECT_ID
    || payload.iss !== TOKEN_ISSUER
    || typeof payload.sub !== "string"
    || !payload.sub
    || payload.sub.length > 128
    || typeof payload.exp !== "number"
    || payload.exp <= now
    || typeof payload.iat !== "number"
    || payload.iat > now + 60) throw new Error("invalid-token");
  return payload;
}

async function requireProfile(request) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) throw new Error("missing-token");
  const token = match[1];
  const claims = await verifyFirebaseToken(token);
  const response = await fetch(`${FIRESTORE_USERS}/${encodeURIComponent(claims.sub)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
  });
  if (!response.ok) throw new Error("profile-not-authorized");
  const document = await response.json();
  const fields = document.fields || {};
  const role = fields.role?.stringValue || "";
  const active = fields.active?.booleanValue === true;
  const mustChangePassword = fields.mustChangePassword?.booleanValue !== false;
  if (!active || mustChangePassword) throw new Error("profile-not-authorized");
  return { uid: claims.sub, email: claims.email || fields.email?.stringValue || "", role, token, fields };
}

async function requireAdmin(request) {
  const profile = await requireProfile(request);
  const authorizedRole = profile.role === "admin" || (profile.role === "superadmin" && profile.uid === SUPERADMIN_UID);
  if (!authorizedRole) throw new Error("profile-not-authorized");
  return profile;
}

async function requireInternalManager(request) {
  const profile = await requireProfile(request);
  const allowed = (profile.role === "superadmin" && profile.uid === SUPERADMIN_UID)
    || (profile.role === "admin" && profile.email.toLowerCase() === MAGNA_EMAIL);
  if (!allowed) throw new Error("profile-not-authorized");
  return profile;
}

async function requireEmployee(request) {
  const profile = await requireProfile(request);
  if (profile.role !== "employee") throw new Error("profile-not-authorized");
  return profile;
}

function firestoreString(fields, name) {
  return fields?.[name]?.stringValue || "";
}

function allowedHotspotIps(env) {
  return String(env.HOTSPOT_ALLOWED_IPS || "").split(",").map((value) => value.trim()).filter(Boolean);
}

function hotspotStatus(request, env) {
  const allowed = allowedHotspotIps(env);
  const connectingIp = request.headers.get("CF-Connecting-IP") || "";
  return { configured: allowed.length > 0, verified: allowed.includes(connectingIp) };
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function listTimeEntries(env, prefix, limit = 250) {
  const keys = [];
  let cursor;
  do {
    const page = await env.CAPANNONE_DATA.list({ prefix, limit: Math.min(1000, limit - keys.length), cursor });
    keys.push(...page.keys);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor && keys.length < limit);
  const items = (await Promise.all(keys.map(async (item) => env.CAPANNONE_DATA.get(item.name, "json")))).filter(Boolean);
  return items.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
}

function mediaKind(contentType) {
  if (["image/jpeg", "image/png", "image/webp"].includes(contentType)) return "image";
  if (["video/mp4", "video/webm"].includes(contentType)) return "video";
  return "";
}

function hasValidSignature(bytes, contentType) {
  if (contentType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png") return bytes.slice(0, 8).every((value, index) => value === [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a][index]);
  if (contentType === "image/webp") return new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  if (contentType === "video/mp4") return new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp";
  if (contentType === "video/webm") return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  return false;
}

function publicLegacyItem(item, request) {
  return { ...item, imageUrl: `${new URL(request.url).origin}/images/${item.id}` };
}

async function serveKvObject(request, object, id, immutable = true) {
  if (!object.value) return fail(request, "Arquivo não encontrado.", 404);
  const buffer = object.value;
  const length = buffer.byteLength;
  const contentType = object.metadata?.contentType || "application/octet-stream";
  const headers = {
    ...corsHeaders(request),
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "ETag": `"${id}"`,
    "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=86400"
  };
  if (request.headers.get("If-None-Match") === headers.ETag) return new Response(null, { status: 304, headers });
  if (request.method === "HEAD") return new Response(null, { status: 200, headers: { ...headers, "Content-Length": String(length) } });
  const range = request.headers.get("Range");
  if (range) {
    const match = range.match(/^bytes=(\d*)-(\d*)$/);
    if (!match) return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${length}` } });
    if ((!match[1] && !match[2]) || (!match[1] && Number(match[2]) <= 0)) return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${length}` } });
    const suffixLength = !match[1] && match[2] ? Number(match[2]) : 0;
    const start = suffixLength ? Math.max(length - suffixLength, 0) : match[1] ? Number(match[1]) : 0;
    const end = suffixLength ? length - 1 : match[2] ? Math.min(Number(match[2]), length - 1) : length - 1;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= length) return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${length}` } });
    const slice = buffer.slice(start, end + 1);
    return new Response(slice, { status: 206, headers: { ...headers, "Content-Length": String(slice.byteLength), "Content-Range": `bytes ${start}-${end}/${length}` } });
  }
  return new Response(buffer, { status: 200, headers: { ...headers, "Content-Length": String(length) } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      if (!allowedOrigin(origin)) return fail(request, "Origem não autorizada.", 403);
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    if (path === "/health" && request.method === "GET") return json(request, { ok: true, service: "capannone-media", auth: "firebase" });

    if (path === "/hotspot/status" && request.method === "GET") {
      try { await requireEmployee(request); }
      catch (_) { return fail(request, "Sessão de funcionário inválida.", 401); }
      return json(request, hotspotStatus(request, env));
    }

    if (path === "/hotspot/clock" && request.method === "POST") {
      if (!allowedOrigin(origin)) return fail(request, "Origem não autorizada.", 403);
      let employee;
      try { employee = await requireEmployee(request); }
      catch (_) { return fail(request, "Sessão de funcionário inválida.", 401); }
      const network = hotspotStatus(request, env);
      if (!network.configured) return fail(request, "O relógio de ponto ainda aguarda a configuração do Hotspot.", 503);
      if (!network.verified) return fail(request, "Conecte-se à rede Capannone Hotspot para registrar o ponto.", 403);
      let payload;
      try { payload = await request.json(); }
      catch (_) { return fail(request, "Dados do ponto inválidos.", 400); }
      const pin = String(payload?.pin || "");
      if (!/^\d{4,6}$/.test(pin)) return fail(request, "Informe o PIN de 4 a 6 números.", 400);
      const employeeResponse = await fetch(`${FIRESTORE_EMPLOYEES}/${encodeURIComponent(employee.uid)}`, { headers: { Authorization: `Bearer ${employee.token}`, Accept: "application/json" } });
      if (!employeeResponse.ok) return fail(request, "Cadastro do funcionário não encontrado.", 403);
      const employeeDocument = await employeeResponse.json();
      const employeeFields = employeeDocument.fields || {};
      const expectedHash = firestoreString(employeeFields, "phonePinHash");
      const informedHash = await sha256(`${employee.uid}:${pin}`);
      if (!expectedHash || informedHash !== expectedHash) return fail(request, "PIN do telefone inválido.", 403);
      const previous = (await listTimeEntries(env, `time:${employee.uid}:`, 1000))[0];
      if (previous && Date.now() - new Date(previous.timestamp).getTime() < 60000) return fail(request, "Aguarde um minuto antes de registrar novamente.", 429);
      const timestamp = new Date().toISOString();
      const entry = {
        id: crypto.randomUUID(),
        uid: employee.uid,
        email: employee.email,
        displayName: firestoreString(employeeFields, "displayName") || firestoreString(employee.fields, "displayName") || employee.email,
        type: previous?.type === "entrada" ? "saida" : "entrada",
        timestamp,
        source: "capannone-hotspot"
      };
      await env.CAPANNONE_DATA.put(`time:${employee.uid}:${timestamp}:${entry.id}`, JSON.stringify(entry), { metadata: { uid: employee.uid, type: entry.type } });
      return json(request, { ok: true, entry }, 201);
    }

    if (path === "/hotspot/entries" && request.method === "GET") {
      let profile;
      try { profile = await requireProfile(request); }
      catch (_) { return fail(request, "Sessão inválida.", 401); }
      const isEmployeeProfile = profile.role === "employee";
      const isManager = (profile.role === "superadmin" && profile.uid === SUPERADMIN_UID)
        || (profile.role === "admin" && profile.email.toLowerCase() === MAGNA_EMAIL);
      if (!isEmployeeProfile && !isManager) return fail(request, "Acesso não autorizado.", 403);
      const prefix = isEmployeeProfile ? `time:${profile.uid}:` : "time:";
      const items = await listTimeEntries(env, prefix, isEmployeeProfile ? 250 : 1000);
      return json(request, { items: items.slice(0, isEmployeeProfile ? 100 : 300), ...hotspotStatus(request, env) });
    }

    if (path === "/campaigns" && request.method === "GET") {
      const items = await env.CAPANNONE_DATA.get("campaigns", "json") || [];
      return json(request, { items: items.map((item) => publicLegacyItem(item, request)) });
    }
    if (path === "/content/history" && request.method === "GET") return json(request, { value: await env.CAPANNONE_DATA.get("content:history") || "" });
    if (path.startsWith("/images/") && ["GET", "HEAD"].includes(request.method)) {
      const id = path.slice(8);
      if (!/^[a-f0-9-]{20,50}$/i.test(id)) return fail(request, "Imagem não encontrada.", 404);
      const object = await env.CAPANNONE_DATA.getWithMetadata(`campaign-image:${id}`, "arrayBuffer");
      return serveKvObject(request, object, id, false);
    }

    if (["/auth", "/campaigns", "/content/history"].includes(path) || path.startsWith("/campaigns/")) {
      if (!["GET", "HEAD"].includes(request.method)) return fail(request, "Esta rota administrativa foi desativada. Use o novo painel.", 410);
    }

    if (path === "/media" && request.method === "POST") {
      if (!allowedOrigin(origin)) return fail(request, "Origem não autorizada.", 403);
      const contentLength = Number(request.headers.get("Content-Length") || 0);
      if (contentLength && contentLength > MAX_REQUEST_BYTES) return fail(request, "O arquivo excede o limite permitido.", 413);
      let admin;
      try { admin = await requireAdmin(request); }
      catch (_) { return fail(request, "Sessão inválida ou sem permissão.", 401); }
      let form;
      try { form = await request.formData(); }
      catch (_) { return fail(request, "Envio inválido.", 400); }
      const file = form.get("file");
      const purpose = String(form.get("purpose") || "").slice(0, 40);
      if (!(file instanceof File) || !file.size) return fail(request, "Escolha um arquivo.");
      if (!ALLOWED_PURPOSES.has(purpose)) return fail(request, "Finalidade de arquivo inválida.");
      const kind = mediaKind(file.type);
      if (!kind) return fail(request, "Formato de arquivo não permitido.", 415);
      const max = kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
      if (file.size > max) return fail(request, kind === "video" ? "O vídeo deve ter até 20 MB." : "A imagem deve ter até 5 MB.", 413);
      const buffer = await file.arrayBuffer();
      if (!hasValidSignature(new Uint8Array(buffer.slice(0, 16)), file.type)) return fail(request, "O conteúdo do arquivo não corresponde ao formato informado.", 415);
      const id = crypto.randomUUID();
      const metadata = { contentType: file.type, size: file.size, kind, purpose, ownerUid: admin.uid, createdAt: new Date().toISOString() };
      await env.CAPANNONE_DATA.put(`media:${id}`, buffer, { metadata });
      return json(request, { id, url: `${url.origin}/media/${id}`, contentType: file.type, size: file.size, kind }, 201);
    }

    if (path.startsWith("/media/") && ["GET", "HEAD"].includes(request.method)) {
      const id = path.slice(7);
      if (!/^[a-f0-9-]{36}$/i.test(id)) return fail(request, "Arquivo não encontrado.", 404);
      const object = await env.CAPANNONE_DATA.getWithMetadata(`media:${id}`, "arrayBuffer");
      return serveKvObject(request, object, id, true);
    }

    if (path.startsWith("/media/") && request.method === "DELETE") {
      if (!allowedOrigin(origin)) return fail(request, "Origem não autorizada.", 403);
      try { await requireAdmin(request); }
      catch (_) { return fail(request, "Sessão inválida ou sem permissão.", 401); }
      const id = path.slice(7);
      if (!/^[a-f0-9-]{36}$/i.test(id)) return fail(request, "Arquivo não encontrado.", 404);
      await env.CAPANNONE_DATA.delete(`media:${id}`);
      return json(request, { ok: true });
    }

    return fail(request, "Rota não encontrada.", 404);
  }
};
