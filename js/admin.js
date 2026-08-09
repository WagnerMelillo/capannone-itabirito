const CAMPAIGN_API = "https://capannone-itabirito-api.wagnermelillo.workers.dev";
const REQUEST_TIMEOUT_MS = 15000;

const getPin = () => sessionStorage.getItem("capannone-admin-pin") || "";
const message = (selector, text, state = "") => {
const element = document.querySelector(selector);
element.textContent = text;
element.dataset.state = state;
};

async function request(path, options = {}) {
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
const { timeoutMs: _timeoutMs, ...fetchOptions } = options;
let response;
try {
response = await fetch(`${CAMPAIGN_API}${path}`, {
cache: "no-store",
credentials: "omit",
referrerPolicy: "no-referrer",
...fetchOptions,
signal: controller.signal
});
} catch (error) {
if (error.name === "AbortError") throw new Error("O serviço demorou para responder. Tente novamente.");
throw new Error("Não foi possível conectar ao serviço agora.");
} finally {
clearTimeout(timeout);
}
const data = await response.json().catch(() => ({}));
const type = response.headers.get("Content-Type") || "";
if (!type.toLowerCase().includes("application/json")) throw new Error("O serviço retornou uma resposta inválida.");
if (!response.ok) throw new Error(data.error || "Não foi possível concluir esta ação.");
return data;
}

function safeImageSource(value) {
const source = String(value || "").trim();
if (/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(source)) return source;
try {
const url = new URL(source, window.location.href);
if (url.protocol === "https:" || (url.origin === window.location.origin && url.protocol === window.location.protocol)) return url.href;
} catch (_) {}
return "";
}

function emptyState(text) {
const paragraph = document.createElement("p");
paragraph.className = "empty-state";
paragraph.textContent = text;
return paragraph;
}

async function showCampaigns() {
const holder = document.querySelector("#admin-campaigns");
holder.replaceChildren(emptyState("Carregando campanhas…"));
try {
const { items } = await request("/campaigns");
if (!Array.isArray(items) || !items.length) {
holder.replaceChildren(emptyState("Nenhuma campanha publicada ainda."));
return;
}
const cards = items.slice(0, 100).map((item) => {
const article = document.createElement("article");
article.className = "admin-campaign";
const image = document.createElement("img");
image.src = safeImageSource(item?.imageUrl || item?.url) || "assets/brand/logo.webp";
image.alt = String(item?.title || "Campanha Capannone").slice(0, 80);
image.loading = "lazy";
const content = document.createElement("div");
const heading = document.createElement("h3");
heading.textContent = String(item?.title || "Campanha sem título").slice(0, 80);
const copy = document.createElement("p");
copy.textContent = String(item?.description || "Sem mensagem complementar.").slice(0, 500);
content.append(heading, copy);
const button = document.createElement("button");
button.className = "delete-button";
button.type = "button";
button.dataset.id = String(item?.id || "");
button.textContent = "Remover";
if (!button.dataset.id) button.disabled = true;
article.append(image, content, button);
return article;
});
holder.replaceChildren(...cards);
holder.querySelectorAll("button[data-id]").forEach((button) => {
button.addEventListener("click", async () => {
if (!confirm("Remover esta campanha do site?")) return;
try {
button.disabled = true;
await request(`/campaigns/${encodeURIComponent(button.dataset.id)}`, { method: "DELETE", headers: { "X-Admin-Pin": getPin() } });
showCampaigns();
} catch (error) { button.disabled = false; message("#form-message", error.message, "error"); }
});
});
} catch (error) {
holder.replaceChildren(emptyState(error.message));
}
}

document.addEventListener("DOMContentLoaded", () => {
const loginCard = document.querySelector("#login-card");
const panel = document.querySelector("#admin-panel");
const pinInput = document.querySelector("#pin");
const loginButton = document.querySelector("#login-button");
let campaignPreviewUrl = "";
const openPanel = () => {
loginCard.hidden = true; panel.hidden = false; pinInput.value = ""; showCampaigns();
window.dispatchEvent(new CustomEvent("capannone-admin-unlocked", { detail: { pin: getPin() } }));
};
loginButton.addEventListener("click", async () => {
const pin = pinInput.value.trim();
if (!pin) return message("#login-message", "Digite o PIN de administração.", "error");
try {
loginButton.disabled = true;
const data = await request("/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
if (!data.ok) throw new Error("PIN inválido.");
sessionStorage.setItem("capannone-admin-pin", pin);
openPanel();
} catch (error) { message("#login-message", error.message, "error"); }
finally { loginButton.disabled = false; }
});
pinInput.addEventListener("keydown", (event) => { if (event.key === "Enter") loginButton.click(); });
document.querySelector("#logout-button").addEventListener("click", () => {
sessionStorage.removeItem("capannone-admin-pin"); panel.hidden = true; loginCard.hidden = false;
window.dispatchEvent(new CustomEvent("capannone-admin-locked"));
pinInput.focus();
});
document.querySelector("#refresh-button").addEventListener("click", showCampaigns);
document.querySelector("#history-load").addEventListener("click", async () => {
try {
const { value } = await request("/content/history");
document.querySelector("#history-text").value = value || "";
message("#history-message", "Texto atual carregado.", "success");
} catch (error) { message("#history-message", error.message, "error"); }
});
document.querySelector("#history-save").addEventListener("click", async () => {
try {
const value = document.querySelector("#history-text").value.trim();
await request("/content/history", { method: "PUT", headers: { "Content-Type": "application/json", "X-Admin-Pin": getPin() }, body: JSON.stringify({ value }) });
message("#history-message", "História salva com sucesso.", "success");
} catch (error) { message("#history-message", error.message, "error"); }
});
document.querySelector("#campaign-image").addEventListener("change", (event) => {
const file = event.target.files?.[0]; const preview = document.querySelector("#image-preview");
if (campaignPreviewUrl) URL.revokeObjectURL(campaignPreviewUrl);
campaignPreviewUrl = "";
if (!file) { preview.removeAttribute("src"); preview.hidden = true; return; }
campaignPreviewUrl = URL.createObjectURL(file); preview.src = campaignPreviewUrl; preview.hidden = false;
});
document.querySelector("#campaign-form").addEventListener("submit", async (event) => {
event.preventDefault(); const file = document.querySelector("#campaign-image").files?.[0];
if (!file) return message("#form-message", "Escolha uma imagem.", "error");
if (!/^image\/(?:jpeg|png|webp)$/.test(file.type)) return message("#form-message", "Use uma imagem JPG, PNG ou WebP.", "error");
if (file.size > 5 * 1024 * 1024) return message("#form-message", "Use uma imagem de até 5 MB.", "error");
const form = new FormData(); form.append("title", document.querySelector("#campaign-title").value.trim()); form.append("description", document.querySelector("#campaign-description").value.trim()); form.append("image", file);
const submit = event.submitter || event.target.querySelector('[type="submit"]');
try {
submit.disabled = true;
message("#form-message", "Publicando campanha…");
await request("/campaigns", { method: "POST", headers: { "X-Admin-Pin": getPin() }, body: form, timeoutMs: 30000 });
event.target.reset(); document.querySelector("#image-preview").hidden = true;
if (campaignPreviewUrl) URL.revokeObjectURL(campaignPreviewUrl);
campaignPreviewUrl = "";
message("#form-message", "Campanha publicada com sucesso.", "success"); showCampaigns();
} catch (error) { message("#form-message", error.message, "error"); }
finally { submit.disabled = false; }
});
if (getPin()) {
request("/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: getPin() }) })
.then((data) => { if (!data.ok) throw new Error(); openPanel(); })
.catch(() => { sessionStorage.removeItem("capannone-admin-pin"); });
}
});
