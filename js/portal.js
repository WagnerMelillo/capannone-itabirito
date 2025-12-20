const CONFIG = {
  menuUrl: "https://linktr.ee/PizzariaCapannone",
  promosUrl: "#",
  instagramUrl: "#"
};

function $(sel){ return document.querySelector(sel); }

function setLinks(){
  $("[data-menu]").href = CONFIG.menuUrl;
  $("[data-promos]").href = CONFIG.promosUrl;
  $("[data-insta]").href = CONFIG.instagramUrl;
  if(CONFIG.instagramUrl === "#"){
    $("[data-insta]").setAttribute("aria-disabled","true");
    $("[data-insta]").title="Link do Instagram ainda não configurado";
  }
}

document.addEventListener("DOMContentLoaded", ()=>{
  setLinks();
  const btn = $("#releaseBtn");
  btn.addEventListener("click", ()=>{
    const ok = $("#terms").checked;
    if(!ok){
      $("#msg").textContent = "Marque o aceite dos termos para liberar.";
      $("#msg").style.display = "block";
      return;
    }
    // Para uso como portal externo real, o técnico pode adaptar o fluxo de autorização do UniFi.
    window.location.href = CONFIG.menuUrl;
  });
});