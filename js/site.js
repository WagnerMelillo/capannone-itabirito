const CONFIG = {
  menuUrl: "https://linktr.ee/PizzariaCapannone",
  promosUrl: "#campanhas",
  instagramUrl: "#", // opcional: coloque aqui o link do Instagram
  rentCalcUrl: "#",  // opcional: coloque aqui o link do cálculo da locação
  whatsappOrderPhone: "31983284984",
  whatsappRentPhone: "31989360951",
  ssidName: "Guest/Hotspot"
};

function $(sel){ return document.querySelector(sel); }

function setLinks(){
  const menu = document.querySelectorAll("[data-menu]");
  const promos = document.querySelectorAll("[data-promos]");
  const insta = document.querySelectorAll("[data-insta]");
  const rent = document.querySelectorAll("[data-rent]");
  menu.forEach(a => a.href = CONFIG.menuUrl);
  promos.forEach(a => a.href = CONFIG.promosUrl);
  insta.forEach(a => a.href = CONFIG.instagramUrl);
  rent.forEach(a => a.href = CONFIG.rentCalcUrl);

  // desabilita se não configurado
  if(CONFIG.instagramUrl === "#"){
    insta.forEach(a => { a.setAttribute("aria-disabled","true"); a.title="Link do Instagram ainda não configurado"; });
  }
  if(CONFIG.rentCalcUrl === "#"){
    rent.forEach(a => { a.setAttribute("aria-disabled","true"); a.title="Link do cálculo ainda não configurado"; });
  }

  const waOrder = document.querySelectorAll("[data-whatsapp-order]");
  const waRent = document.querySelectorAll("[data-whatsapp-rent]");
  const waOrderUrl = `https://wa.me/${CONFIG.whatsappOrderPhone}`;
  const waRentUrl = `https://wa.me/${CONFIG.whatsappRentPhone}`;
  waOrder.forEach(a => a.href = waOrderUrl);
  waRent.forEach(a => a.href = waRentUrl);

  const ssid = document.querySelectorAll("[data-ssid]");
  ssid.forEach(el => el.textContent = CONFIG.ssidName);
}

async function loadCampaigns(){
  const grid = $("#campaignGrid");
  if(!grid) return;

  // placeholders (funcionam offline)
  const placeholders = [
    {key: "p6_img1.webp", label: "Novidades do dia"},
    {key: "p4_img1.webp", label: "Eventos & reservas"},
    {key: "p1_img2.webp", label: "Promoções"}
  ];

  function render(items, source){
    grid.innerHTML = "";
    items.forEach(it => {
      const div = document.createElement("div");
      div.className = "item";
      const img = document.createElement("img");
      img.loading = "lazy";
      img.alt = it.title || it.label || "Campanha Capannone";
      img.src = it.url || `assets/img/${it.key}`;
      const lab = document.createElement("div");
      lab.className = "label";
      lab.textContent = it.title || it.label || "Campanha";
      div.appendChild(img);
      div.appendChild(lab);
      grid.appendChild(div);
    });

    const hint = $("#campaignHint");
    if(hint){
      hint.textContent = source === "api"
        ? "Atualizações feitas pelo administrador."
        : "Prévia local (as campanhas reais aparecem após publicar no Cloudflare).";
    }
  }

  try{
    const res = await fetch("/api/campaigns/list", {cache:"no-store"});
    if(!res.ok) throw new Error("API não disponível");
    const data = await res.json();
    if(Array.isArray(data.items) && data.items.length){
      render(data.items, "api");
      return;
    }
    render(placeholders, "local");
  }catch(e){
    render(placeholders, "local");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setLinks();
  loadHistory();
  loadCampaigns();

  // botão "ver cardápio"
  document.querySelectorAll("[data-open-menu]").forEach(btn=>{
    btn.addEventListener("click", ()=> window.location.href = CONFIG.menuUrl);
  });
});