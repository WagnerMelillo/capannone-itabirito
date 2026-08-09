import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { collection, doc, getDoc, getDocs, getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { CATEGORY_LABELS, DEFAULT_MENU_ITEMS, DEFAULT_SITE_CONTENT } from "./default-content.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const ORDER_TEXT = "Olá! Quero fazer um pedido na Capannone.";
const EVENT_TEXT = "Olá! Quero saber sobre a locação do espaço Capannone.";
const state = {
  content: { ...DEFAULT_SITE_CONTENT },
  products: DEFAULT_MENU_ITEMS.map((item) => ({ ...item, prices: item.prices.map((price) => ({ ...price })) })),
  campaigns: [],
  activeTab: "pizzas"
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const clean = (value, limit = 1000) => String(value ?? "").trim().slice(0, limit);
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(number(value));

function safeUrl(value, { allowDataImage = false } = {}) {
  const source = clean(value, 3000);
  if (!source) return "";
  if (allowDataImage && /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(source)) return source;
  try {
    const url = new URL(source, location.href);
    if (url.protocol === "https:" || (url.origin === location.origin && ["http:", "https:"].includes(url.protocol))) return url.href;
  } catch (_) {}
  return "";
}

function phoneDigits(value) {
  return clean(value, 24).replace(/\D/g, "").slice(0, 13);
}

function formatPhone(value) {
  const digits = phoneDigits(value).replace(/^55(?=\d{10,11}$)/, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return clean(value, 24);
}

function whatsappUrl(numberValue, message) {
  const digits = phoneDigits(numberValue);
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : "#";
}

function setText(selector, value) {
  const element = $(selector);
  if (element && clean(value)) element.textContent = clean(value, 5000);
}

function setImage(selector, value) {
  const element = $(selector);
  const source = safeUrl(value, { allowDataImage: true });
  if (element && source) element.src = source;
}

function setLinks(kind, value) {
  const url = safeUrl(value);
  if (!url) return;
  $$(`[data-site-link="${kind}"]`).forEach((link) => { link.href = url; });
}

function setValues(kind, value) {
  $$(`[data-site-value="${kind}"]`).forEach((element) => { element.textContent = value; });
}

function applySiteContent(content) {
  state.content = { ...DEFAULT_SITE_CONTENT, ...content };
  const current = state.content;
  setText("#site-announcement", current.announcement);
  setText("#site-hero-text", current.heroText);
  setText("#site-history-title", current.historyTitle);
  setText("#site-events-title", current.eventsTitle);
  setText("#site-events-text", current.eventsText);
  setText("#site-location-hours", current.openingHours);
  setText("#site-footer-hours", current.openingHours);
  setImage("#site-hero-image", current.heroImageUrl);
  setImage("#site-history-image", current.historyImageUrl);
  setImage("#site-events-image", current.eventsImageUrl);

  const heroTitle = $("#site-hero-title");
  if (heroTitle) {
    const emphasis = document.createElement("em");
    emphasis.textContent = clean(current.heroHighlight, 40);
    heroTitle.replaceChildren(document.createTextNode(`${clean(current.heroTitle, 80)} `), emphasis, document.createTextNode(` ${clean(current.heroSuffix, 100)}`));
  }

  const story = $("#story-content");
  if (story && clean(current.historyText, 5000)) {
    story.replaceChildren(...clean(current.historyText, 5000).split(/\n\s*\n/).filter(Boolean).map((paragraph) => {
      const element = document.createElement("p");
      element.textContent = paragraph;
      return element;
    }));
  }

  const address = clean(current.address, 300);
  const addressLines = address.split(/\r?\n/).filter(Boolean);
  setText("#site-location-address", address);
  setText("#site-footer-address", addressLines.slice(0, 2).join("\n"));
  setText("#site-hero-hours", current.openingHours);
  setText("#site-hero-address", addressLines.slice(0, 2).join(" · "));

  const orderPhone = formatPhone(current.whatsapp);
  const eventsPhone = formatPhone(current.eventsWhatsapp);
  const landline = formatPhone(current.phone);
  setValues("order-phone", orderPhone);
  setValues("events-phone", eventsPhone);
  setValues("phone", landline);
  setLinks("order", whatsappUrl(current.whatsapp, ORDER_TEXT));
  setLinks("events", whatsappUrl(current.eventsWhatsapp, EVENT_TEXT));
  $$('[data-site-link="events-phone"]').forEach((link) => { link.href = `tel:+${phoneDigits(current.eventsWhatsapp)}`; });
  $$('[data-site-link="phone"]').forEach((link) => { link.href = `tel:+${phoneDigits(current.phone)}`; });
  setLinks("aiqfome", current.aiqfomeUrl);
  setLinks("instagram", current.instagramUrl);
  setLinks("facebook", current.facebookUrl);

  const structured = $('script[type="application/ld+json"]');
  if (structured) {
    try {
      const data = JSON.parse(structured.textContent);
      data.telephone = current.phone;
      data.address.streetAddress = addressLines[0] || data.address.streetAddress;
      data.sameAs = [safeUrl(current.instagramUrl), safeUrl(current.facebookUrl)].filter(Boolean);
      structured.textContent = JSON.stringify(data);
    } catch (_) {}
  }
}

function mediaForProduct(item) {
  const imageUrl = safeUrl(item.imageUrl, { allowDataImage: true });
  const videoUrl = safeUrl(item.videoUrl);
  if (!imageUrl && !videoUrl) return null;
  const holder = document.createElement("div");
  holder.className = "product-media";
  if (imageUrl) {
    const image = document.createElement("img");
    image.src = imageUrl;
    image.alt = clean(item.name, 100);
    image.loading = "lazy";
    image.decoding = "async";
    holder.append(image);
  }
  if (videoUrl) {
    const directVideo = item.videoMediaId || /\.(?:mp4|webm)(?:$|[?#])/i.test(videoUrl);
    if (directVideo) {
      const video = document.createElement("video");
      video.src = videoUrl;
      video.controls = true;
      video.preload = "metadata";
      video.playsInline = true;
      video.setAttribute("aria-label", `Vídeo de ${clean(item.name, 100)}`);
      holder.append(video);
    } else {
      const link = document.createElement("a");
      link.href = videoUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "product-video-link";
      link.textContent = "Assistir ao vídeo ↗";
      holder.append(link);
    }
  }
  return holder;
}

function priceGrid(item) {
  const prices = document.createElement("div");
  prices.className = "prices";
  (Array.isArray(item.prices) ? item.prices : []).slice(0, 12).forEach((entry) => {
    const row = document.createElement("div");
    const label = document.createElement("span");
    const value = document.createElement("strong");
    label.textContent = clean(entry?.label, 80) || "Preço";
    value.textContent = money(entry?.value);
    row.append(label, value);
    prices.append(row);
  });
  return prices;
}

function productCard(item, compact = false) {
  const article = document.createElement("article");
  article.className = compact ? "drink-card product-card" : "pizza-card product-card";
  const media = mediaForProduct(item);
  if (media) article.append(media);
  const title = document.createElement("h3");
  title.textContent = clean(item.name, 100);
  article.append(title);
  if (clean(item.description)) {
    const description = document.createElement("p");
    description.className = "ingredients";
    description.textContent = clean(item.description, 1000);
    article.append(description);
  }
  article.append(priceGrid(item));
  const order = document.createElement("a");
  order.className = "pizza-order";
  order.href = whatsappUrl(state.content.whatsapp, clean(item.orderMessage, 300) || `Olá! Quero pedir ${clean(item.name, 100)} na Capannone.`);
  order.target = "_blank";
  order.rel = "noopener noreferrer";
  order.textContent = compact ? "Incluir no pedido ↗" : "Pedir este item ↗";
  article.append(order);
  return article;
}

function renderMenu(tab = state.activeTab) {
  state.activeTab = tab;
  const content = $("#menu-content");
  if (!content) return;
  const items = state.products
    .filter((item) => item.active !== false && item.category === tab)
    .sort((a, b) => number(a.sortOrder, 9999) - number(b.sortOrder, 9999) || clean(a.name).localeCompare(clean(b.name), "pt-BR"));
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "menu-empty";
    empty.textContent = `Nenhum item disponível em ${CATEGORY_LABELS[tab] || "esta categoria"} no momento.`;
    content.replaceChildren(empty);
    return;
  }
  const holder = document.createElement("div");
  const compact = !["pizzas", "promocoes"].includes(tab);
  holder.className = compact ? "drinks-grid products-grid" : "pizza-grid products-grid";
  holder.append(...items.map((item) => productCard(item, compact)));
  content.replaceChildren(holder);
}

function campaignIsVisible(item, now = Date.now()) {
  if (!["active", "scheduled"].includes(item.status)) return false;
  const start = item.startAt ? Date.parse(item.startAt) : NaN;
  const end = item.endAt ? Date.parse(item.endAt) : NaN;
  if (item.status === "scheduled" && (!Number.isFinite(start) || start > now)) return false;
  if (Number.isFinite(start) && start > now) return false;
  if (Number.isFinite(end) && end <= now) return false;
  return true;
}

function discountLabel(item) {
  const value = number(item.discountValue);
  if (["percent", "percentage"].includes(item.discountType) && value > 0) return `${value}% DE DESCONTO`;
  if (item.discountType === "fixed" && value > 0) return `${money(value)} DE DESCONTO`;
  if (item.discountType === "special_price" && value > 0) return `PREÇO ESPECIAL: ${money(value)}`;
  return "NOVIDADE DA CASA";
}

function campaignCard(item, productsById) {
  const article = document.createElement("article");
  article.className = "campaign-card";
  const source = safeUrl(item.imageUrl, { allowDataImage: true });
  if (source) {
    const image = document.createElement("img");
    image.src = source;
    image.alt = clean(item.title, 100) || "Campanha Capannone";
    image.loading = "lazy";
    image.decoding = "async";
    article.append(image);
  } else {
    article.classList.add("campaign-card-no-image");
  }
  const body = document.createElement("div");
  const label = document.createElement("span");
  label.textContent = discountLabel(item);
  const title = document.createElement("h3");
  title.textContent = clean(item.title, 100) || "Novidade Capannone";
  const description = document.createElement("p");
  description.textContent = clean(item.description, 1000) || "Confira esta novidade da Capannone.";
  body.append(label, title, description);
  const linkedProducts = (Array.isArray(item.productIds) ? item.productIds : []).map((id) => productsById.get(id)?.name).filter(Boolean);
  if (linkedProducts.length) {
    const products = document.createElement("small");
    products.className = "campaign-products";
    products.textContent = `Inclui: ${linkedProducts.join(", ")}`;
    body.append(products);
  }
  const link = document.createElement("a");
  link.href = whatsappUrl(state.content.whatsapp, `Olá! Vi a campanha “${clean(item.title, 100)}” e quero saber mais.`);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Quero saber mais ↗";
  body.append(link);
  article.append(body);
  return article;
}

function renderCampaigns({ authoritative = false } = {}) {
  const grid = $("#campaigns-grid");
  const hint = $("#campaignHint");
  if (!grid) return;
  const productsById = new Map(state.products.map((item) => [item.id, item]));
  const visible = state.campaigns
    .filter((item) => campaignIsVisible(item))
    .sort((a, b) => number(b.priority) - number(a.priority) || clean(b.startAt).localeCompare(clean(a.startAt)))
    .slice(0, 8);
  if (visible.length) {
    grid.replaceChildren(...visible.map((item) => campaignCard(item, productsById)));
    if (hint) hint.textContent = "Campanhas exibidas automaticamente conforme o período definido pela equipe.";
  } else if (authoritative) {
    grid.replaceChildren();
    if (hint) hint.textContent = "Não há campanhas ativas no momento. Acompanhe nossas redes para novidades.";
  }
}

async function loadManagedContent() {
  try {
    const [contentSnapshot, productSnapshot, campaignSnapshot] = await Promise.all([
      getDoc(doc(db, "siteContent", "home")),
      getDocs(collection(db, "menuItems")),
      getDocs(collection(db, "campaigns"))
    ]);
    const initialized = contentSnapshot.exists();
    if (initialized) applySiteContent(contentSnapshot.data());
    if (productSnapshot.size || initialized) {
      state.products = productSnapshot.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }));
      renderMenu();
    }
    state.campaigns = campaignSnapshot.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }));
    renderCampaigns({ authoritative: initialized });
  } catch (_) {
    // O conteúdo padrão já está renderizado; uma indisponibilidade externa não esvazia o site.
  }
}

function wireInterface() {
  const year = $("#year");
  if (year) year.textContent = new Date().getFullYear();
  $$('[data-menu-tab]').forEach((button) => {
    button.addEventListener("click", () => {
      $$('[data-menu-tab]').forEach((item) => {
        const selected = item === button;
        item.classList.toggle("active", selected);
        item.setAttribute("aria-selected", String(selected));
      });
      renderMenu(button.dataset.menuTab);
    });
  });
}

applySiteContent(DEFAULT_SITE_CONTENT);
wireInterface();
renderMenu();
loadManagedContent();
