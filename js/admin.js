import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updatePassword
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  setDoc,
  updateDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { CATEGORY_LABELS, DEFAULT_MENU_ITEMS, DEFAULT_SITE_CONTENT, MEDIA_API } from "./default-content.js";

const SUPERADMIN_UID = "unHjEmB7jXPGTXhvc2mFB9Iht3h1";
const SUPERADMIN_EMAIL = "magnamelillo@gmail.com";
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const secondaryApp = initializeApp(firebaseConfig, "capannone-user-management");
const secondaryAuth = getAuth(secondaryApp);

const state = {
  profile: null,
  content: { ...DEFAULT_SITE_CONTENT },
  products: [],
  campaigns: [],
  gallery: [],
  users: [],
  activeView: "dashboard",
  toastTimer: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const nowIso = () => new Date().toISOString();
const clean = (value, max = 1000) => String(value ?? "").trim().slice(0, max);
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const isSuperadmin = () => Boolean(auth.currentUser?.uid === SUPERADMIN_UID && state.profile?.role === "superadmin" && state.profile?.active);
const isAuthorized = () => Boolean(state.profile?.active && (state.profile.role === "admin" || isSuperadmin()));

function setMessage(selector, text = "", type = "") {
  const element = $(selector);
  if (!element) return;
  element.textContent = text;
  element.dataset.state = type;
}

function toast(text, type = "success") {
  const element = $("#admin-toast");
  clearTimeout(state.toastTimer);
  element.textContent = text;
  element.dataset.state = type;
  element.hidden = false;
  state.toastTimer = setTimeout(() => { element.hidden = true; }, 4500);
}

function friendlyError(error) {
  const code = String(error?.code || "");
  const messages = {
    "auth/invalid-credential": "E-mail ou senha inválidos.",
    "auth/invalid-email": "Confira o endereço de e-mail.",
    "auth/email-already-in-use": "Já existe um usuário com este e-mail.",
    "auth/weak-password": "A senha precisa ser mais forte.",
    "auth/requires-recent-login": "Por segurança, saia e entre novamente antes de trocar a senha.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    "permission-denied": "Seu usuário não tem permissão para esta ação.",
    "firestore/permission-denied": "Seu usuário não tem permissão para esta ação."
  };
  return messages[code] || clean(error?.message || "Não foi possível concluir esta ação.", 260);
}

function safeMediaSource(value) {
  const source = clean(value, 1200000);
  if (!source) return "";
  if (/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(source)) return source;
  try {
    const parsed = new URL(source, location.href);
    if (parsed.protocol === "https:" || parsed.origin === location.origin) return parsed.href;
  } catch (_) {}
  return "";
}

function safeExternalUrl(value) {
  try {
    const parsed = new URL(clean(value, 500));
    return parsed.protocol === "https:" ? parsed.href : "";
  } catch (_) {
    return "";
  }
}

function validateFile(file, kind = "image") {
  if (!file) return;
  const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  const videoTypes = new Set(["video/mp4", "video/webm"]);
  const allowed = kind === "video" ? videoTypes : imageTypes;
  const max = kind === "video" ? 20 * 1024 * 1024 : 5 * 1024 * 1024;
  if (!allowed.has(file.type)) throw new Error(kind === "video" ? "Use um vídeo MP4 ou WebM." : "Use uma imagem JPG, PNG ou WebP.");
  if (file.size > max) throw new Error(kind === "video" ? "O vídeo deve ter até 20 MB." : "A imagem deve ter até 5 MB.");
}

async function uploadMedia(file, purpose) {
  validateFile(file, file.type.startsWith("video/") ? "video" : "image");
  const token = await auth.currentUser.getIdToken();
  const form = new FormData();
  form.append("file", file);
  form.append("purpose", purpose);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`${MEDIA_API}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Não foi possível enviar o arquivo.");
    return data;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("O envio demorou demais. Confira sua conexão e tente novamente.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function removeMedia(mediaId) {
  if (!mediaId) return;
  const token = await auth.currentUser.getIdToken();
  await fetch(`${MEDIA_API}/media/${encodeURIComponent(mediaId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer"
  }).catch(() => {});
}

async function audit(action, entityType, entityId = "", details = {}) {
  if (!auth.currentUser || !state.profile) return;
  await addDoc(collection(db, "auditLogs"), {
    action: clean(action, 80),
    entityType: clean(entityType, 50),
    entityId: clean(entityId, 160),
    actorUid: auth.currentUser.uid,
    actorEmail: clean(auth.currentUser.email, 200),
    actorRole: state.profile.role,
    details,
    createdAt: nowIso()
  }).catch(() => {});
}

function showAuthView(view) {
  $("#login-view").hidden = view !== "login";
  $("#password-view").hidden = view !== "password";
  $("#admin-app").hidden = view !== "app";
  $("#logout-button").hidden = view === "login";
  $("#user-summary").hidden = view === "login";
}

function applyRoleVisibility() {
  $$(".superadmin-only").forEach((element) => {
    if (element.dataset.view === "users" && state.activeView !== "users") {
      element.hidden = true;
      return;
    }
    element.hidden = !isSuperadmin();
  });
}

function switchView(name) {
  if (name === "users" && !isSuperadmin()) name = "dashboard";
  state.activeView = name;
  $$(".admin-view").forEach((view) => { view.hidden = view.dataset.view !== name; });
  $$("[data-admin-view]").forEach((button) => button.classList.toggle("active", button.dataset.adminView === name));
  applyRoleVisibility();
  if (name === "dashboard") renderDashboard();
  if (name === "content") fillContentForm();
  if (name === "menu") renderProducts();
  if (name === "campaigns") renderCampaigns();
  if (name === "gallery") renderGallery();
  if (name === "users") renderUsers();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadCollection(name) {
  const snapshot = await getDocs(collection(db, name));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

async function loadAllData() {
  if (!isAuthorized()) return;
  const [contentDoc, products, campaigns, gallery] = await Promise.all([
    getDoc(doc(db, "siteContent", "home")),
    loadCollection("menuItems"),
    loadCollection("campaigns"),
    loadCollection("espaco_fotos")
  ]);
  state.content = { ...DEFAULT_SITE_CONTENT, ...(contentDoc.exists() ? contentDoc.data() : {}) };
  state.products = products.sort((a, b) => number(a.sortOrder) - number(b.sortOrder) || clean(a.name).localeCompare(clean(b.name), "pt-BR"));
  state.campaigns = campaigns.sort((a, b) => clean(b.updatedAt || b.createdAt).localeCompare(clean(a.updatedAt || a.createdAt)));
  state.gallery = gallery.sort((a, b) => clean(b.createdAt).localeCompare(clean(a.createdAt)) || number(b.createdAt) - number(a.createdAt));
  if (isSuperadmin()) state.users = (await loadCollection("users")).sort((a, b) => clean(a.displayName || a.email).localeCompare(clean(b.displayName || b.email), "pt-BR"));
  renderDashboard();
  renderProducts();
  renderCampaigns();
  renderGallery();
  renderUsers();
  fillContentForm();
}

function renderDashboard() {
  $("#metric-products").textContent = String(state.products.filter((item) => item.active).length);
  $("#metric-campaigns").textContent = String(state.campaigns.filter((item) => campaignRuntimeStatus(item) === "active").length);
  $("#metric-gallery").textContent = String(state.gallery.length);
  if (isSuperadmin()) $("#metric-users").textContent = String(state.users.filter((item) => item.id !== SUPERADMIN_UID && item.active).length);
}

function fillContentForm() {
  const map = {
    announcement: "#content-announcement", heroTitle: "#content-hero-title", heroHighlight: "#content-hero-highlight",
    heroSuffix: "#content-hero-suffix", heroText: "#content-hero-text", historyTitle: "#content-history-title",
    historyText: "#content-history-text", eventsTitle: "#content-events-title", eventsText: "#content-events-text",
    openingHours: "#content-hours", address: "#content-address", phone: "#content-phone", whatsapp: "#content-whatsapp",
    eventsWhatsapp: "#content-events-whatsapp", aiqfomeUrl: "#content-aiqfome", instagramUrl: "#content-instagram", facebookUrl: "#content-facebook"
  };
  Object.entries(map).forEach(([key, selector]) => { $(selector).value = state.content[key] || ""; });
  [["hero", state.content.heroImageUrl], ["history", state.content.historyImageUrl], ["events", state.content.eventsImageUrl]].forEach(([key, value]) => {
    const preview = $(`#content-${key}-preview`);
    const source = safeMediaSource(value);
    preview.hidden = !source;
    if (source) preview.src = source;
  });
}

function selectedPrices() {
  return $$(".price-row", $("#price-rows")).map((row) => ({
    label: clean($(".price-label", row).value, 50),
    value: number($(".price-value", row).value, -1)
  })).filter((item) => item.label && item.value >= 0);
}

function addPriceRow(label = "", value = "") {
  const row = $("#price-row-template").content.firstElementChild.cloneNode(true);
  $(".price-label", row).value = label;
  $(".price-value", row).value = value;
  $(".remove-price", row).addEventListener("click", () => row.remove());
  $("#price-rows").append(row);
}

function money(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(number(value));
}

function emptyList(text) {
  const element = document.createElement("p");
  element.className = "list-empty";
  element.textContent = text;
  return element;
}

function badge(text, className = "") {
  const element = document.createElement("span");
  element.className = `badge ${className}`.trim();
  element.textContent = text;
  return element;
}

function actionButton(label, action, id, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `small-action ${className}`.trim();
  button.dataset.action = action;
  button.dataset.id = id;
  button.textContent = label;
  return button;
}

function renderProducts() {
  const holder = $("#product-list");
  if (!holder) return;
  const search = clean($("#product-search").value, 100).toLocaleLowerCase("pt-BR");
  const category = $("#product-category-filter").value;
  const items = state.products.filter((item) => (!category || item.category === category) && (!search || `${item.name} ${item.description}`.toLocaleLowerCase("pt-BR").includes(search)));
  if (!items.length) return holder.replaceChildren(emptyList("Nenhum item encontrado."));
  holder.replaceChildren(...items.map((item) => {
    const source = safeMediaSource(item.imageUrl);
    const card = document.createElement("article");
    card.className = `list-card${source ? "" : " no-image"}`;
    if (source) {
      const image = document.createElement("img"); image.className = "list-card-media"; image.src = source; image.alt = clean(item.name, 100); image.loading = "lazy"; card.append(image);
    }
    const content = document.createElement("div");
    const title = document.createElement("h3"); title.textContent = clean(item.name, 100) || "Item sem nome";
    const description = document.createElement("p"); description.textContent = clean(item.description, 260) || "Sem descrição.";
    const meta = document.createElement("div"); meta.className = "list-card-meta";
    meta.append(badge(CATEGORY_LABELS[item.category] || "Outra"), badge(item.active ? "Visível" : "Oculto", item.active ? "active" : "ended"));
    (Array.isArray(item.prices) ? item.prices : []).slice(0, 4).forEach((entry) => meta.append(badge(`${clean(entry.label, 40)}: ${money(entry.value)}`)));
    if (item.videoUrl) meta.append(badge("Com vídeo", "active"));
    content.append(title, description, meta);
    const actions = document.createElement("div"); actions.className = "list-card-actions";
    actions.append(actionButton("Editar", "edit-product", item.id), actionButton(item.active ? "Ocultar" : "Mostrar", "toggle-product", item.id), actionButton("Excluir", "delete-product", item.id, "danger"));
    card.append(content, actions);
    return card;
  }));
}

function openProduct(item = null) {
  $("#product-form").reset();
  $("#price-rows").replaceChildren();
  $("#product-id").value = item?.id || "";
  $("#product-dialog-title").textContent = item ? "Editar item" : "Novo item";
  $("#product-name").value = item?.name || "";
  $("#product-category").value = item?.category || "pizzas";
  $("#product-description").value = item?.description || "";
  $("#product-sort-order").value = number(item?.sortOrder, state.products.length + 1);
  $("#product-active").checked = item ? Boolean(item.active) : true;
  $("#product-image-media-id").value = item?.imageMediaId || "";
  $("#product-image-url").value = item?.imageUrl || "";
  $("#product-video-media-id").value = item?.videoMediaId || "";
  $("#product-video-url-current").value = item?.videoUrl || "";
  $("#product-video-url").value = item?.videoMediaId ? "" : item?.videoUrl || "";
  $("#product-order-message").value = item?.orderMessage || (item?.name ? `Olá! Quero pedir ${item.name} na Capannone.` : "");
  const source = safeMediaSource(item?.imageUrl);
  $("#product-image-preview").hidden = !source;
  if (source) $("#product-image-preview").src = source;
  const prices = Array.isArray(item?.prices) && item.prices.length ? item.prices : [{ label: "Unidade", value: "" }];
  prices.forEach((entry) => addPriceRow(entry.label, entry.value));
  setMessage("#product-message");
  $("#product-dialog").showModal();
}

function campaignRuntimeStatus(item) {
  if (item.status === "ended" || item.status === "draft") return item.status;
  const now = Date.now();
  const start = item.startAt ? new Date(item.startAt).getTime() : 0;
  const end = item.endAt ? new Date(item.endAt).getTime() : Infinity;
  if (Number.isFinite(start) && start > now) return "scheduled";
  if (Number.isFinite(end) && end < now) return "ended";
  return item.status === "scheduled" && !start ? "scheduled" : "active";
}

function statusLabel(status) {
  return ({ draft: "Rascunho", scheduled: "Agendada", active: "Ativa", ended: "Encerrada" })[status] || "Rascunho";
}

function formatDate(value) {
  if (!value) return "sem data";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "data inválida" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function renderCampaigns() {
  const holder = $("#campaign-list");
  if (!holder) return;
  const filter = $("#campaign-status-filter").value;
  const items = state.campaigns.filter((item) => !filter || campaignRuntimeStatus(item) === filter);
  if (!items.length) return holder.replaceChildren(emptyList("Nenhuma campanha encontrada."));
  holder.replaceChildren(...items.map((item) => {
    const runtime = campaignRuntimeStatus(item);
    const source = safeMediaSource(item.imageUrl);
    const card = document.createElement("article"); card.className = `list-card${source ? "" : " no-image"}`;
    if (source) { const image = document.createElement("img"); image.className = "list-card-media"; image.src = source; image.alt = clean(item.title, 100); image.loading = "lazy"; card.append(image); }
    const content = document.createElement("div");
    const title = document.createElement("h3"); title.textContent = clean(item.title, 100) || "Campanha sem título";
    const description = document.createElement("p"); description.textContent = clean(item.description, 260) || "Sem mensagem.";
    const meta = document.createElement("div"); meta.className = "list-card-meta";
    meta.append(badge(statusLabel(runtime), runtime === "active" ? "active" : runtime === "ended" ? "ended" : "warning"));
    if (item.startAt || item.endAt) meta.append(badge(`${formatDate(item.startAt)} até ${formatDate(item.endAt)}`));
    if (Array.isArray(item.productIds) && item.productIds.length) meta.append(badge(`${item.productIds.length} produto(s)`));
    content.append(title, description, meta);
    const actions = document.createElement("div"); actions.className = "list-card-actions";
    actions.append(actionButton("Editar", "edit-campaign", item.id));
    if (runtime !== "ended") actions.append(actionButton("Encerrar", "end-campaign", item.id));
    actions.append(actionButton("Excluir", "delete-campaign", item.id, "danger"));
    card.append(content, actions);
    return card;
  }));
}

function toLocalDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function openCampaign(item = null) {
  $("#campaign-form").reset();
  $("#campaign-id").value = item?.id || "";
  $("#campaign-dialog-title").textContent = item ? "Editar campanha" : "Nova campanha";
  $("#campaign-title").value = item?.title || "";
  $("#campaign-description").value = item?.description || "";
  $("#campaign-status").value = item?.status || "draft";
  $("#campaign-priority").value = number(item?.priority, 10);
  $("#campaign-start").value = toLocalDateTime(item?.startAt);
  $("#campaign-end").value = toLocalDateTime(item?.endAt);
  $("#campaign-discount-type").value = item?.discountType || "none";
  $("#campaign-discount-value").value = item?.discountValue ?? "";
  $("#campaign-image-media-id").value = item?.imageMediaId || "";
  $("#campaign-image-url").value = item?.imageUrl || "";
  const source = safeMediaSource(item?.imageUrl);
  $("#campaign-preview").hidden = !source;
  if (source) $("#campaign-preview").src = source;
  const selected = new Set(Array.isArray(item?.productIds) ? item.productIds : []);
  $("#campaign-products").replaceChildren(...state.products.filter((product) => product.active).map((product) => {
    const option = document.createElement("option"); option.value = product.id; option.textContent = `${CATEGORY_LABELS[product.category] || "Outra"} · ${product.name}`; option.selected = selected.has(product.id); return option;
  }));
  setMessage("#campaign-message");
  $("#campaign-dialog").showModal();
}

function renderGallery() {
  const holder = $("#gallery-list");
  if (!holder) return;
  if (!state.gallery.length) return holder.replaceChildren(emptyList("Nenhuma foto publicada."));
  holder.replaceChildren(...state.gallery.map((item) => {
    const source = safeMediaSource(item.imageUrl || item.imageBase64);
    const card = document.createElement("article"); card.className = `list-card${source ? "" : " no-image"}`;
    if (source) { const image = document.createElement("img"); image.className = "list-card-media"; image.src = source; image.alt = clean(item.caption, 240) || "Foto do espaço"; image.loading = "lazy"; card.append(image); }
    const content = document.createElement("div"); const title = document.createElement("h3"); title.textContent = clean(item.caption, 240) || "Foto sem legenda"; content.append(title);
    const actions = document.createElement("div"); actions.className = "list-card-actions"; actions.append(actionButton("Excluir", "delete-gallery", item.id, "danger"));
    card.append(content, actions); return card;
  }));
}

function renderUsers() {
  const holder = $("#user-list");
  if (!holder || !isSuperadmin()) return;
  if (!state.users.length) return holder.replaceChildren(emptyList("Nenhum usuário cadastrado."));
  const users = [...state.users].sort((a, b) => Number(b.id === SUPERADMIN_UID) - Number(a.id === SUPERADMIN_UID));
  holder.replaceChildren(...users.map((item) => {
    const isOwner = item.id === SUPERADMIN_UID;
    const card = document.createElement("article"); card.className = "list-card no-image";
    const content = document.createElement("div"); const title = document.createElement("h3"); title.textContent = clean(item.displayName || item.email, 120);
    const description = document.createElement("p"); description.textContent = clean(item.email, 200);
    const meta = document.createElement("div"); meta.className = "list-card-meta";
    meta.append(badge(isOwner ? "Proprietário do painel" : "Equipe de marketing"), badge(item.active ? "Acesso ativo" : "Acesso removido", item.active ? "active" : "ended"));
    if (item.mustChangePassword) meta.append(badge("Troca de senha pendente", "warning"));
    content.append(title, description, meta);
    const actions = document.createElement("div"); actions.className = "list-card-actions";
    if (!isOwner) {
      actions.append(actionButton("Exigir troca no próximo acesso", "require-password", item.id), actionButton(item.active ? "Remover acesso" : "Restaurar acesso", "toggle-user", item.id, item.active ? "danger" : ""));
    }
    card.append(content, actions); return card;
  }));
}

async function handleContentSave(event) {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  setMessage("#content-message", "Salvando…");
  const previous = { ...state.content };
  const uploaded = [];
  try {
    const next = {
      announcement: clean($("#content-announcement").value, 120), heroTitle: clean($("#content-hero-title").value, 80),
      heroHighlight: clean($("#content-hero-highlight").value, 40), heroSuffix: clean($("#content-hero-suffix").value, 100), heroText: clean($("#content-hero-text").value, 360),
      historyTitle: clean($("#content-history-title").value, 120), historyText: clean($("#content-history-text").value, 5000), eventsTitle: clean($("#content-events-title").value, 140),
      eventsText: clean($("#content-events-text").value, 800), openingHours: clean($("#content-hours").value, 100), address: clean($("#content-address").value, 300),
      phone: clean($("#content-phone").value, 24), whatsapp: clean($("#content-whatsapp").value, 20).replace(/\D/g, ""), eventsWhatsapp: clean($("#content-events-whatsapp").value, 20).replace(/\D/g, ""),
      aiqfomeUrl: safeExternalUrl($("#content-aiqfome").value), instagramUrl: safeExternalUrl($("#content-instagram").value), facebookUrl: safeExternalUrl($("#content-facebook").value),
      heroImageUrl: previous.heroImageUrl || "", heroImageMediaId: previous.heroImageMediaId || "", historyImageUrl: previous.historyImageUrl || "", historyImageMediaId: previous.historyImageMediaId || "",
      eventsImageUrl: previous.eventsImageUrl || "", eventsImageMediaId: previous.eventsImageMediaId || "", updatedAt: nowIso(), updatedBy: auth.currentUser.uid
    };
    const uploads = [];
    for (const key of ["hero", "history", "events"]) {
      const file = $(`#content-${key}-image`).files?.[0];
      if (!file) continue;
      const media = await uploadMedia(file, `site-${key}`);
      uploaded.push(media.id);
      next[`${key}ImageUrl`] = media.url;
      next[`${key}ImageMediaId`] = media.id;
      if (previous[`${key}ImageMediaId`]) uploads.push(previous[`${key}ImageMediaId`]);
    }
    await setDoc(doc(db, "siteContent", "home"), next, { merge: true });
    state.content = { ...state.content, ...next };
    await Promise.all(uploads.map(removeMedia));
    await audit("update", "siteContent", "home");
    event.target.reset(); fillContentForm();
    setMessage("#content-message", "Conteúdo salvo. As alterações já estão disponíveis para o site.", "success");
    toast("Conteúdo do site atualizado.");
  } catch (error) {
    await Promise.all(uploaded.map(removeMedia));
    setMessage("#content-message", friendlyError(error), "error");
  } finally { button.disabled = false; }
}

async function handleProductSave(event) {
  event.preventDefault();
  const button = event.submitter; button.disabled = true;
  setMessage("#product-message", "Salvando…");
  const id = $("#product-id").value || doc(collection(db, "menuItems")).id;
  const old = state.products.find((item) => item.id === id);
  let imageMediaId = $("#product-image-media-id").value;
  let imageUrl = $("#product-image-url").value;
  let videoMediaId = $("#product-video-media-id").value;
  let videoUrl = $("#product-video-url-current").value;
  const obsolete = [];
  const uploaded = [];
  try {
    const imageFile = $("#product-image").files?.[0];
    const videoFile = $("#product-video").files?.[0];
    const externalVideo = safeExternalUrl($("#product-video-url").value);
    if (imageFile) { const media = await uploadMedia(imageFile, "product-image"); uploaded.push(media.id); if (imageMediaId) obsolete.push(imageMediaId); imageMediaId = media.id; imageUrl = media.url; }
    if (videoFile) { const media = await uploadMedia(videoFile, "product-video"); uploaded.push(media.id); if (videoMediaId) obsolete.push(videoMediaId); videoMediaId = media.id; videoUrl = media.url; }
    else if (externalVideo) { if (videoMediaId) obsolete.push(videoMediaId); videoMediaId = ""; videoUrl = externalVideo; }
    const prices = selectedPrices();
    if (!prices.length) throw new Error("Adicione pelo menos um preço válido.");
    const item = {
      name: clean($("#product-name").value, 100), category: $("#product-category").value, description: clean($("#product-description").value, 1000), prices,
      active: $("#product-active").checked, sortOrder: number($("#product-sort-order").value, 0), imageMediaId, imageUrl, videoMediaId, videoUrl,
      orderMessage: clean($("#product-order-message").value, 240), updatedAt: nowIso(), updatedBy: auth.currentUser.uid, createdAt: old?.createdAt || nowIso()
    };
    if (!item.name) throw new Error("Digite o nome do item.");
    await setDoc(doc(db, "menuItems", id), item);
    await Promise.all(obsolete.map(removeMedia));
    await audit(old ? "update" : "create", "menuItem", id, { name: item.name });
    const record = { id, ...item }; const index = state.products.findIndex((entry) => entry.id === id);
    if (index >= 0) state.products[index] = record; else state.products.push(record);
    state.products.sort((a, b) => number(a.sortOrder) - number(b.sortOrder) || clean(a.name).localeCompare(clean(b.name), "pt-BR"));
    $("#product-dialog").close(); renderProducts(); renderDashboard(); toast("Item do cardápio salvo.");
  } catch (error) { await Promise.all(uploaded.map(removeMedia)); setMessage("#product-message", friendlyError(error), "error"); }
  finally { button.disabled = false; }
}

async function handleCampaignSave(event) {
  event.preventDefault(); const button = event.submitter; button.disabled = true; setMessage("#campaign-message", "Salvando…");
  const id = $("#campaign-id").value || doc(collection(db, "campaigns")).id;
  const old = state.campaigns.find((item) => item.id === id);
  let imageMediaId = $("#campaign-image-media-id").value; let imageUrl = $("#campaign-image-url").value;
  let previousMediaId = "";
  let uploadedMediaId = "";
  try {
    const imageFile = $("#campaign-image").files?.[0];
    if (imageFile) { const media = await uploadMedia(imageFile, "campaign-image"); uploadedMediaId = media.id; previousMediaId = imageMediaId; imageMediaId = media.id; imageUrl = media.url; }
    if (!imageUrl) throw new Error("Escolha uma imagem para a campanha.");
    const startValue = $("#campaign-start").value; const endValue = $("#campaign-end").value;
    const startAt = startValue ? new Date(startValue).toISOString() : ""; const endAt = endValue ? new Date(endValue).toISOString() : "";
    if (startAt && endAt && new Date(endAt) <= new Date(startAt)) throw new Error("A data final deve ser posterior à data inicial.");
    const item = {
      title: clean($("#campaign-title").value, 100), description: clean($("#campaign-description").value, 1000), status: $("#campaign-status").value,
      priority: number($("#campaign-priority").value, 10), startAt, endAt, discountType: $("#campaign-discount-type").value,
      discountValue: number($("#campaign-discount-value").value, 0), productIds: Array.from($("#campaign-products").selectedOptions).map((option) => option.value).slice(0, 100),
      imageMediaId, imageUrl, updatedAt: nowIso(), updatedBy: auth.currentUser.uid, createdAt: old?.createdAt || nowIso()
    };
    if (!item.title) throw new Error("Digite o título da campanha.");
    await setDoc(doc(db, "campaigns", id), item);
    if (previousMediaId && previousMediaId !== imageMediaId) await removeMedia(previousMediaId);
    await audit(old ? "update" : "create", "campaign", id, { title: item.title, status: item.status });
    const record = { id, ...item }; const index = state.campaigns.findIndex((entry) => entry.id === id);
    if (index >= 0) state.campaigns[index] = record; else state.campaigns.unshift(record);
    $("#campaign-dialog").close(); renderCampaigns(); renderDashboard(); toast("Campanha salva.");
  } catch (error) { if (uploadedMediaId) await removeMedia(uploadedMediaId); setMessage("#campaign-message", friendlyError(error), "error"); }
  finally { button.disabled = false; }
}

async function handleGallerySave(event) {
  event.preventDefault(); const button = event.submitter; button.disabled = true; setMessage("#gallery-message", "Enviando foto…");
  let uploadedMediaId = "";
  try {
    const file = $("#gallery-image").files?.[0]; if (!file) throw new Error("Escolha uma imagem.");
    const media = await uploadMedia(file, "gallery-image");
    uploadedMediaId = media.id;
    const record = { caption: clean($("#gallery-caption").value, 240), imageUrl: media.url, mediaId: media.id, createdAt: nowIso(), createdBy: auth.currentUser.uid };
    const reference = await addDoc(collection(db, "espaco_fotos"), record);
    state.gallery.unshift({ id: reference.id, ...record });
    await audit("create", "galleryPhoto", reference.id);
    event.target.reset(); $("#gallery-preview").hidden = true; setMessage("#gallery-message", "Foto publicada.", "success"); renderGallery(); renderDashboard(); toast("Foto adicionada à galeria.");
  } catch (error) { if (uploadedMediaId) await removeMedia(uploadedMediaId); setMessage("#gallery-message", friendlyError(error), "error"); }
  finally { button.disabled = false; }
}

async function handleUserSave(event) {
  event.preventDefault(); if (!isSuperadmin()) return;
  const button = event.submitter; button.disabled = true; setMessage("#user-message", "Criando acesso…");
  try {
    const displayName = clean($("#user-name").value, 100); const email = clean($("#user-email").value, 200).toLowerCase(); const password = $("#user-temp-password").value;
    if (email === SUPERADMIN_EMAIL) throw new Error("Este e-mail pertence ao proprietário do painel e não pode ser cadastrado como marketing.");
    if (password.length < 10 || !/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) throw new Error("A senha provisória deve ter ao menos 10 caracteres, com letras e números.");
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const record = { displayName, email, role: "admin", active: true, mustChangePassword: true, createdAt: nowIso(), createdBy: auth.currentUser.uid, updatedAt: nowIso() };
    await setDoc(doc(db, "users", credential.user.uid), record);
    await signOut(secondaryAuth);
    state.users.push({ id: credential.user.uid, ...record });
    await audit("create", "user", credential.user.uid, { email });
    event.target.reset(); $("#user-dialog").close(); renderUsers(); renderDashboard(); toast("Administrador criado. Entregue a senha provisória por um canal seguro.");
  } catch (error) {
    if (secondaryAuth.currentUser) await deleteUser(secondaryAuth.currentUser).catch(() => signOut(secondaryAuth).catch(() => {}));
    setMessage("#user-message", friendlyError(error), "error");
  }
  finally { button.disabled = false; }
}

async function handleProductAction(button) {
  const item = state.products.find((entry) => entry.id === button.dataset.id); if (!item) return;
  if (button.dataset.action === "edit-product") return openProduct(item);
  if (button.dataset.action === "toggle-product") {
    button.disabled = true; await updateDoc(doc(db, "menuItems", item.id), { active: !item.active, updatedAt: nowIso(), updatedBy: auth.currentUser.uid }); item.active = !item.active; await audit("toggle", "menuItem", item.id, { active: item.active }); renderProducts(); renderDashboard(); return;
  }
  if (button.dataset.action === "delete-product" && confirm(`Excluir “${item.name}” do cardápio?`)) {
    button.disabled = true; await deleteDoc(doc(db, "menuItems", item.id)); await Promise.all([removeMedia(item.imageMediaId), removeMedia(item.videoMediaId)]); state.products = state.products.filter((entry) => entry.id !== item.id); await audit("delete", "menuItem", item.id, { name: item.name }); renderProducts(); renderDashboard(); toast("Item excluído.");
  }
}

async function handleCampaignAction(button) {
  const item = state.campaigns.find((entry) => entry.id === button.dataset.id); if (!item) return;
  if (button.dataset.action === "edit-campaign") return openCampaign(item);
  if (button.dataset.action === "end-campaign" && confirm(`Encerrar a campanha “${item.title}” agora?`)) {
    button.disabled = true; await updateDoc(doc(db, "campaigns", item.id), { status: "ended", endAt: nowIso(), updatedAt: nowIso(), updatedBy: auth.currentUser.uid }); item.status = "ended"; item.endAt = nowIso(); await audit("end", "campaign", item.id); renderCampaigns(); renderDashboard(); toast("Campanha encerrada."); return;
  }
  if (button.dataset.action === "delete-campaign" && confirm(`Excluir definitivamente a campanha “${item.title}”?`)) {
    button.disabled = true; await deleteDoc(doc(db, "campaigns", item.id)); await removeMedia(item.imageMediaId); state.campaigns = state.campaigns.filter((entry) => entry.id !== item.id); await audit("delete", "campaign", item.id); renderCampaigns(); renderDashboard(); toast("Campanha excluída.");
  }
}

async function handleGalleryAction(button) {
  const item = state.gallery.find((entry) => entry.id === button.dataset.id); if (!item || !confirm("Excluir esta foto da galeria?")) return;
  button.disabled = true; await deleteDoc(doc(db, "espaco_fotos", item.id)); await removeMedia(item.mediaId); state.gallery = state.gallery.filter((entry) => entry.id !== item.id); await audit("delete", "galleryPhoto", item.id); renderGallery(); renderDashboard(); toast("Foto excluída.");
}

async function handleUserAction(button) {
  if (!isSuperadmin()) return;
  const item = state.users.find((entry) => entry.id === button.dataset.id); if (!item || item.id === SUPERADMIN_UID) return;
  if (button.dataset.action === "require-password") {
    button.disabled = true; await updateDoc(doc(db, "users", item.id), { mustChangePassword: true, updatedAt: nowIso(), updatedBy: auth.currentUser.uid }); item.mustChangePassword = true; await audit("require-password-change", "user", item.id); renderUsers(); toast("A troca de senha será obrigatória no próximo acesso."); return;
  }
  if (button.dataset.action === "toggle-user") {
    const question = item.active
      ? `Remover o acesso de ${item.email}? A pessoa perderá imediatamente a permissão de alterar o site.`
      : `Restaurar o acesso de ${item.email}?`;
    if (!confirm(question)) return;
    button.disabled = true;
    await updateDoc(doc(db, "users", item.id), { active: !item.active, updatedAt: nowIso(), updatedBy: auth.currentUser.uid });
    item.active = !item.active;
    await audit(item.active ? "restore-access" : "revoke-access", "user", item.id, { active: item.active });
    renderUsers(); renderDashboard(); toast(item.active ? "Acesso restaurado." : "Acesso removido imediatamente.");
  }
}

async function seedDefaultsIfEmpty() {
  if (!isSuperadmin() || state.products.length) return;
  const batch = writeBatch(db);
  DEFAULT_MENU_ITEMS.forEach(({ id, ...item }) => batch.set(doc(db, "menuItems", id), { ...item, createdAt: nowIso(), updatedAt: nowIso(), updatedBy: auth.currentUser.uid }));
  batch.set(doc(db, "siteContent", "home"), { ...DEFAULT_SITE_CONTENT, createdAt: nowIso(), updatedAt: nowIso(), updatedBy: auth.currentUser.uid }, { merge: true });
  await batch.commit();
  await audit("seed", "baseline", "initial-content", { items: DEFAULT_MENU_ITEMS.length });
  await loadAllData();
}

function wirePreview(inputSelector, previewSelector) {
  $(inputSelector).addEventListener("change", (event) => {
    const file = event.target.files?.[0]; const preview = $(previewSelector);
    if (!file) return;
    try { validateFile(file); preview.src = URL.createObjectURL(file); preview.hidden = false; }
    catch (error) { event.target.value = ""; toast(friendlyError(error), "error"); }
  });
}

function wireUi() {
  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const button = event.submitter; button.disabled = true; setMessage("#login-message", "Entrando…");
    try { await signInWithEmailAndPassword(auth, clean($("#login-email").value, 200).toLowerCase(), $("#login-password").value); event.target.reset(); }
    catch (error) { setMessage("#login-message", friendlyError(error), "error"); }
    finally { button.disabled = false; }
  });
  $("#password-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const password = $("#new-password").value; const confirmation = $("#confirm-password").value;
    if (password !== confirmation) return setMessage("#password-message", "As senhas não coincidem.", "error");
    if (!/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) return setMessage("#password-message", "Use letras e números na nova senha.", "error");
    const button = event.submitter; button.disabled = true;
    try { await updatePassword(auth.currentUser, password); await updateDoc(doc(db, "users", auth.currentUser.uid), { mustChangePassword: false, passwordChangedAt: nowIso(), updatedAt: nowIso() }); state.profile.mustChangePassword = false; await audit("password-change", "user", auth.currentUser.uid); event.target.reset(); showAuthView("app"); await loadAllData(); switchView("dashboard"); }
    catch (error) { setMessage("#password-message", friendlyError(error), "error"); }
    finally { button.disabled = false; }
  });
  $("#logout-button").addEventListener("click", () => signOut(auth));
  $$("[data-admin-view], [data-go-view]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.adminView || button.dataset.goView)));
  $("#refresh-dashboard").addEventListener("click", async () => { await loadAllData(); toast("Dados atualizados."); });
  $("#content-form").addEventListener("submit", handleContentSave);
  $("#product-form").addEventListener("submit", handleProductSave);
  $("#campaign-form").addEventListener("submit", handleCampaignSave);
  $("#gallery-form").addEventListener("submit", handleGallerySave);
  $("#user-form").addEventListener("submit", handleUserSave);
  $("#new-product-button").addEventListener("click", () => openProduct());
  $("#new-campaign-button").addEventListener("click", () => openCampaign());
  $("#new-user-button").addEventListener("click", () => { $("#user-form").reset(); setMessage("#user-message"); $("#user-dialog").showModal(); });
  $("#add-price-button").addEventListener("click", () => addPriceRow());
  $$('[data-close-dialog]').forEach((button) => button.addEventListener("click", () => $(`#${button.dataset.closeDialog}`).close()));
  $("#product-search").addEventListener("input", renderProducts); $("#product-category-filter").addEventListener("change", renderProducts); $("#campaign-status-filter").addEventListener("change", renderCampaigns);
  $("#product-list").addEventListener("click", (event) => { const button = event.target.closest("button[data-action]"); if (button) handleProductAction(button).catch((error) => toast(friendlyError(error), "error")); });
  $("#campaign-list").addEventListener("click", (event) => { const button = event.target.closest("button[data-action]"); if (button) handleCampaignAction(button).catch((error) => toast(friendlyError(error), "error")); });
  $("#gallery-list").addEventListener("click", (event) => { const button = event.target.closest("button[data-action]"); if (button) handleGalleryAction(button).catch((error) => toast(friendlyError(error), "error")); });
  $("#user-list").addEventListener("click", (event) => { const button = event.target.closest("button[data-action]"); if (button) handleUserAction(button).catch((error) => toast(friendlyError(error), "error")); });
  wirePreview("#content-hero-image", "#content-hero-preview"); wirePreview("#content-history-image", "#content-history-preview"); wirePreview("#content-events-image", "#content-events-preview");
  wirePreview("#product-image", "#product-image-preview"); wirePreview("#campaign-image", "#campaign-preview"); wirePreview("#gallery-image", "#gallery-preview");
}

wireUi();
setPersistence(auth, browserSessionPersistence).catch(() => {});
onAuthStateChanged(auth, async (user) => {
  setMessage("#login-message");
  if (!user) { state.profile = null; state.products = []; state.campaigns = []; state.gallery = []; state.users = []; showAuthView("login"); return; }
  try {
    const profileDoc = await getDoc(doc(db, "users", user.uid));
    if (!profileDoc.exists()) throw new Error("Este usuário não foi autorizado pelo super-administrador.");
    state.profile = { id: profileDoc.id, ...profileDoc.data() };
    if (!isAuthorized()) throw new Error("Este acesso está bloqueado. Fale com o super-administrador.");
    $("#user-summary").textContent = `${state.profile.displayName || user.email} · ${state.profile.role === "superadmin" ? "Super-administrador" : "Marketing"}`;
    $("#welcome-name").textContent = clean(state.profile.displayName || user.email?.split("@")[0] || "equipe", 80);
    applyRoleVisibility();
    if (state.profile.mustChangePassword) { showAuthView("password"); return; }
    showAuthView("app"); await loadAllData(); await seedDefaultsIfEmpty(); switchView("dashboard");
  } catch (error) {
    await signOut(auth).catch(() => {});
    showAuthView("login"); setMessage("#login-message", friendlyError(error), "error");
  }
});
