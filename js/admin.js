const CAMPAIGN_API = "https://capannone-itabirito-api.wagnermelillo.workers.dev";

const getPin = () => sessionStorage.getItem("capannone-admin-pin") || "";
const message = (selector, text, state = "") => {
const element = document.querySelector(selector);
element.textContent = text;
element.dataset.state = state;
};

async function request(path, options = {}) {
const response = await fetch(`${CAMPAIGN_API}${path}`, options);
const data = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(data.error || "Não foi possível concluir esta ação.");
return data;
}

async function showCampaigns() {
const holder = document.querySelector("#admin-campaigns");
holder.innerHTML = '<p class="empty-state">Carregando campanhas…</p>';
try {
const { items } = await request("/campaigns");
if (!items.length) {
holder.innerHTML = '<p class="empty-state">Nenhuma campanha publicada ainda.</p>';
return;
}
holder.innerHTML = items.map((item) => `<article class="admin-campaign"><img src="${item.imageUrl}" alt="${item.title}"><div><h3>${item.title}</h3><p>${item.description || "Sem mensagem complementar."}</p></div><button class="delete-button" type="button" data-id="${item.id}">Remover</button></article>`).join("");
holder.querySelectorAll("[data-id]").forEach((button) => {
button.addEventListener("click", async () => {
if (!confirm("Remover esta campanha do site?")) return;
try {
await request(`/campaigns/${button.dataset.id}`, { method: "DELETE", headers: { "X-Admin-Pin": getPin() } });
showCampaigns();
} catch (error) { message("#form-message", error.message, "error"); }
});
});
} catch (error) {
holder.innerHTML = `<p class="empty-state">${error.message}</p>`;
}
}

document.addEventListener("DOMContentLoaded", () => {
const loginCard = document.querySelector("#login-card");
const panel = document.querySelector("#admin-panel");
const openPanel = () => {
loginCard.hidden = true; panel.hidden = false; showCampaigns();
window.dispatchEvent(new CustomEvent("capannone-admin-unlocked", { detail: { pin: getPin() } }));
};
document.querySelector("#login-button").addEventListener("click", async () => {
const pin = document.querySelector("#pin").value.trim();
if (!pin) return message("#login-message", "Digite o PIN de administração.", "error");
try {
const data = await request("/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
if (!data.ok) throw new Error("PIN inválido.");
sessionStorage.setItem("capannone-admin-pin", pin);
openPanel();
} catch (error) { message("#login-message", error.message, "error"); }
});
document.querySelector("#pin").addEventListener("keydown", (event) => { if (event.key === "Enter") document.querySelector("#login-button").click(); });
document.querySelector("#logout-button").addEventListener("click", () => {
sessionStorage.removeItem("capannone-admin-pin"); panel.hidden = true; loginCard.hidden = false;
window.dispatchEvent(new CustomEvent("capannone-admin-locked"));
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
if (!file) { preview.hidden = true; return; }
preview.src = URL.createObjectURL(file); preview.hidden = false;
});
document.querySelector("#campaign-form").addEventListener("submit", async (event) => {
event.preventDefault(); const file = document.querySelector("#campaign-image").files?.[0];
if (!file) return message("#form-message", "Escolha uma imagem.", "error");
if (file.size > 5 * 1024 * 1024) return message("#form-message", "Use uma imagem de até 5 MB.", "error");
const form = new FormData(); form.append("title", document.querySelector("#campaign-title").value.trim()); form.append("description", document.querySelector("#campaign-description").value.trim()); form.append("image", file);
try {
message("#form-message", "Publicando campanha…");
await request("/campaigns", { method: "POST", headers: { "X-Admin-Pin": getPin() }, body: form });
event.target.reset(); document.querySelector("#image-preview").hidden = true;
message("#form-message", "Campanha publicada com sucesso.", "success"); showCampaigns();
} catch (error) { message("#form-message", error.message, "error"); }
});
if (getPin()) openPanel();
});
