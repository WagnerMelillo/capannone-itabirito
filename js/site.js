const ORDER_URL = "https://wa.me/5531983284984?text=";
const CAMPAIGN_API = "https://capannone-itabirito-api.wagnermelillo.workers.dev";

const pizzas = [
["Alemã","molho de tomate, muçarela, azeitona, catupiry, lombo canadense, calabresa, bacon e orégano",67],
["Pepperoni","molho de tomate, muçarela, azeitona, catupiry, pepperoni e orégano",77],
["Calabresa com catupiry","molho de tomate, muçarela, calabresa, catupiry e orégano",67],
["Calabresa baiana","molho de tomate, calabresa ralada, catupiry, lemon pepper e orégano",67],
["Lombo canadense","molho de tomate, muçarela, lombo canadense, azeitona, catupiry e orégano",67],
["Portuguesa","molho de tomate, muçarela, calabresa, presunto, ovos, catupiry, azeitonas pretas e orégano",67],
["Palmito à bolonhesa","molho à bolonhesa, muçarela, palmito, catupiry, azeitonas e orégano",67],
["Frango com palmito","molho de tomate, muçarela, milho, azeitona, catupiry, peito de frango, palmito e orégano",67],
["Presunto com catupiry","molho de tomate, muçarela, presunto, catupiry, azeitonas e orégano",67],
["À moda da casa","molho de tomate, muçarela, peito de frango, calabresa, bacon, milho, catupiry, azeitonas e orégano",67],
["Bolonhesa","molho à bolonhesa, muçarela, champignon na manteiga, catupiry, azeitonas e orégano",67],
["Siciliana","molho de tomate, muçarela, champignon na manteiga, catupiry, bacon, calabresa, azeitonas e orégano",67],
["Bação","molho de tomate, cupim ao molho de cerveja preta, muçarela, catupiry, azeitonas e orégano",77],
["Carne seca","molho de tomate, muçarela, azeitona, catupiry, carne seca e orégano",77],
["Mineirinha","molho de tomate, muçarela, azeitona, catupiry, linguiça suína ao molho de mel com mostarda, pimenta calabresa, alho frito e orégano",77],
["Abobrinha","molho de tomate, fatias de abobrinha, muçarela, queijo polenguinho, bacon e orégano",67],
["Brócolis com bacon","molho de tomate, muçarela, catupiry, brócolis, bacon e alho frito",67],
["Milho e bacon","molho de tomate, muçarela, azeitona, catupiry, milho, bacon e orégano",67],
["Atum com catupiry","molho de tomate, muçarela, atum, catupiry, azeitonas e orégano",67],
["Vegetariana","molho de tomate, muçarela, palmito, milho, catupiry, champignon na manteiga, azeitonas e orégano",67],
["Marguerita","molho de tomate, muçarela, tomate cereja e manjericão",67],
["Quatro queijos","molho de tomate, muçarela, provolone, cheddar, catupiry e orégano",67],
["Palmito com catupiry","molho de tomate, muçarela, palmito, milho, catupiry, azeitonas e orégano",67],
["Alho-poró","molho de tomate, muçarela, requeijão catupiry, alho-poró, bacon, creme de leite, alho granulado e orégano",77],
["Frango com catupiry","molho de tomate, muçarela, peito de frango, milho, catupiry, azeitonas e orégano",67],
["Alho e óleo","molho de tomate, muçarela, azeite, alho frito e orégano",67],
["Abacaxi com bacon","molho de tomate, muçarela, azeitona, catupiry, abacaxi caramelizado, bacon e orégano",77],
["Presunto parma","molho de tomate, muçarela, azeitona, catupiry, presunto parma e orégano",77],
["Charmozinha","massa, molho de tomate especial, muçarela, carne suína desfiada, requeijão cremoso, cebola roxa e molho barbecue",67]
];

const money = (value) => `R$ ${value.toFixed(2).replace(".", ",")}`;

function pizzaMarkup() {
return `<p class="menu-note">Média 30cm · 6 fatias &nbsp; | &nbsp; Grande 35cm · 8 fatias &nbsp; | &nbsp; Gigante 40cm · 12 fatias</p><div class="pizza-grid">${pizzas.map(([name, ingredients, base]) => {
const msg = encodeURIComponent(`Olá! Quero pedir a pizza ${name} na Capannone.`);
return `<article class="pizza-card"><h3>${name}</h3><p class="ingredients">${ingredients}</p><div class="prices"><div><span>Média · 30cm</span><strong>${money(base)}</strong></div><div><span>Grande · 35cm</span><strong>${money(base + 12)}</strong></div><div><span>Gigante · 40cm</span><strong>${money(base + 24)}</strong></div></div><a class="pizza-order" href="${ORDER_URL}${msg}" target="_blank" rel="noopener">Pedir este sabor ↗</a></article>`;
}).join("")}</div>`;
}

function drinksMarkup() {
return `<div class="drinks-grid"><article class="drink-card"><h3>Cervejas</h3><ul class="drink-list"><li><span>Heineken Zero · long neck</span><b>R$ 12,00</b></li><li><span>Heineken · 600ml / long neck</span><b>R$ 18,00 / 12,00</b></li><li><span>Original · 600ml</span><b>R$ 16,00</b></li><li><span>Stella Artois · 600ml / long neck</span><b>R$ 17,00 / 12,00</b></li><li><span>Spaten · 600ml</span><b>R$ 16,00</b></li></ul></article><article class="drink-card"><h3>Refrigerantes</h3><ul class="drink-list"><li><span>Coca-Cola · lata 350ml</span><b>R$ 6,50</b></li><li><span>Coca-Cola · 2 litros</span><b>R$ 18,00</b></li><li><span>Guaraná · lata 350ml</span><b>R$ 6,50</b></li><li><span>Guaraná · 1 litro</span><b>R$ 11,00</b></li><li><span>Guaraná · 2 litros</span><b>R$ 16,00</b></li></ul></article></div>`;
}

function juicesMarkup() {
return `<div class="drinks-grid"><article class="drink-card"><h3>Sucos</h3><ul class="drink-list"><li><span>Suco de pêssego · 1 litro</span><b>R$ 14,00</b></li><li><span>Suco de pêssego · lata 290ml</span><b>R$ 6,50</b></li><li><span>Suco de uva · 1 litro</span><b>R$ 14,00</b></li><li><span>Suco de uva · lata 290ml</span><b>R$ 6,50</b></li></ul></article><article class="drink-card"><h3>Para acompanhar</h3><p class="ingredients">Consulte a equipe sobre disponibilidade de bebidas e combinações para o seu pedido.</p><a class="button button-dark" href="${ORDER_URL}${encodeURIComponent("Olá! Quero fazer um pedido na Capannone.")}" target="_blank" rel="noopener">Falar com a equipe ↗</a></article></div>`;
}

function promotionMarkup() {
const msg = encodeURIComponent("Olá! Quero pedir a pizza à moda da casa na Capannone.");
return `<div class="promo-menu"><div><p class="eyebrow light">PROMOÇÃO DE DESTAQUE</p><h3>À moda da casa</h3><p>Molho de tomate, muçarela, peito de frango, calabresa, bacon, milho, catupiry, azeitonas e orégano.</p><a class="pizza-order" href="${ORDER_URL}${msg}" target="_blank" rel="noopener">Pedir essa pizza ↗</a></div><div class="promo-prices"><div><span>Média · 30cm</span><b>R$ 67,00</b></div><div><span>Grande · 35cm</span><b>R$ 79,00</b></div><div><span>Gigante · 40cm</span><b>R$ 91,00</b></div></div></div>`;
}

function renderMenu(tab = "pizzas") {
const content = document.querySelector("#menu-content");
if (!content) return;
content.innerHTML = tab === "pizzas" ? pizzaMarkup() : tab === "cervejas" ? drinksMarkup().replace("Refrigerantes", "Refrigerantes") : tab === "refrigerantes" ? drinksMarkup() : tab === "sucos" ? juicesMarkup() : promotionMarkup();
if (tab === "cervejas") content.innerHTML = `<div class="drinks-grid"><article class="drink-card"><h3>Cervejas</h3><ul class="drink-list"><li><span>Heineken Zero · long neck</span><b>R$ 12,00</b></li><li><span>Heineken · 600ml / long neck</span><b>R$ 18,00 / 12,00</b></li><li><span>Original · 600ml</span><b>R$ 16,00</b></li><li><span>Stella Artois · 600ml / long neck</span><b>R$ 17,00 / 12,00</b></li><li><span>Spaten · 600ml</span><b>R$ 16,00</b></li></ul></article><article class="drink-card"><h3>Boa pedida</h3><p class="ingredients">Uma pizza quentinha e uma cerveja gelada para deixar a sua noite ainda melhor.</p><a class="button button-dark" href="${ORDER_URL}${encodeURIComponent("Olá! Quero fazer um pedido na Capannone.")}" target="_blank" rel="noopener">Fazer pedido ↗</a></article></div>`;
if (tab === "refrigerantes") content.innerHTML = `<div class="drinks-grid"><article class="drink-card"><h3>Refrigerantes</h3><ul class="drink-list"><li><span>Coca-Cola · lata 350ml</span><b>R$ 6,50</b></li><li><span>Coca-Cola · 2 litros</span><b>R$ 18,00</b></li><li><span>Guaraná · lata 350ml</span><b>R$ 6,50</b></li><li><span>Guaraná · 1 litro</span><b>R$ 11,00</b></li><li><span>Guaraná · 2 litros</span><b>R$ 16,00</b></li></ul></article><article class="drink-card"><h3>Para acompanhar</h3><p class="ingredients">Combine sua pizza com a bebida que não pode faltar na sua mesa.</p><a class="button button-dark" href="${ORDER_URL}${encodeURIComponent("Olá! Quero fazer um pedido na Capannone.")}" target="_blank" rel="noopener">Fazer pedido ↗</a></article></div>`;
}

function campaignCard(item) {
const safeTitle = String(item.title || "Novidade Capannone").replace(/[<>]/g, "");
const safeText = String(item.description || "Confira essa novidade da Capannone.").replace(/[<>]/g, "");
const src = item.imageUrl || item.url;
if (!src) return "";
return `<article class="campaign-card"><img src="${src}" alt="${safeTitle}" loading="lazy"><div><span>NOVIDADE DA CASA</span><h3>${safeTitle}</h3><p>${safeText}</p><a href="${ORDER_URL}${encodeURIComponent(`Olá! Vi a campanha '${safeTitle}' e quero saber mais.`)}" target="_blank" rel="noopener">Quero saber mais ↗</a></div></article>`;
}

async function loadCampaigns() {
const grid = document.querySelector("#campaigns-grid");
if (!grid) return;
try {
const response = await fetch(`${CAMPAIGN_API}/campaigns`, { cache: "no-store" });
if (!response.ok) throw new Error("Campanhas indisponíveis");
const data = await response.json();
if (Array.isArray(data.items) && data.items.length) {
grid.innerHTML = data.items.slice(0, 6).map(campaignCard).join("");
}
} catch (_) {
// The permanent cards in the HTML remain available when the campaign service is offline.
}
}

async function loadStory() {
const holder = document.querySelector("#story-content");
if (!holder) return;
try {
const response = await fetch(`${CAMPAIGN_API}/content/history`, { cache: "no-store" });
if (!response.ok) return;
const { value } = await response.json();
if (!value) return;
holder.replaceChildren(...String(value).split(/\n\s*\n/).filter(Boolean).map((paragraph) => {
const element = document.createElement("p");
element.textContent = paragraph;
return element;
}));
} catch (_) {
// The institutional story remains visible when the content service is unavailable.
}
}

document.addEventListener("DOMContentLoaded", () => {
document.querySelector("#year").textContent = new Date().getFullYear();
renderMenu();
document.querySelectorAll("[data-menu-tab]").forEach((button) => {
button.addEventListener("click", () => {
document.querySelectorAll("[data-menu-tab]").forEach((item) => {
const selected = item === button;
item.classList.toggle("active", selected);
item.setAttribute("aria-selected", String(selected));
});
renderMenu(button.dataset.menuTab);
});
});
loadCampaigns();
loadStory();
});
