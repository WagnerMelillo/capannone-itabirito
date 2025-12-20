function $(sel){ return document.querySelector(sel); }

async function apiAuth(pin){
  const res = await fetch("/api/auth", {
    method:"POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({pin})
  });
  if(!res.ok) return {ok:false};
  return await res.json();


async function apiGetContent(key){
  const res = await fetch(`/api/content/get?key=${encodeURIComponent(key)}`, {cache:"no-store"});
  if(!res.ok) throw new Error("Falha ao carregar conteúdo");
  return await res.json();
}

async function apiSetContent(pin, key, value){
  const res = await fetch("/api/content/set", {
    method:"POST",
    headers: {"Content-Type":"application/json", "X-Admin-Pin": pin},
    body: JSON.stringify({key, value})
  });
  const data = await res.json().catch(()=> ({}));
  if(!res.ok) throw new Error(data.error || "Falha ao salvar conteúdo");
  return data;
}

}

async function apiList(){
  const res = await fetch("/api/campaigns/list", {cache:"no-store"});
  if(!res.ok) throw new Error("Falha ao listar");
  return await res.json();
}

async function apiUpload(pin, file, title){
  const fd = new FormData();
  fd.append("file", file);
  fd.append("title", title || "");
  const res = await fetch("/api/campaigns/upload", {
    method:"POST",
    headers: {"X-Admin-Pin": pin},
    body: fd
  });
  const data = await res.json().catch(()=> ({}));
  if(!res.ok) throw new Error(data.error || "Falha no upload");
  return data;
}

async function apiDelete(pin, key){
  const res = await fetch("/api/campaigns/delete", {
    method:"POST",
    headers: {"Content-Type":"application/json", "X-Admin-Pin": pin},
    body: JSON.stringify({key})
  });
  const data = await res.json().catch(()=> ({}));
  if(!res.ok) throw new Error(data.error || "Falha ao excluir");
  return data;
}

function setStatus(text, type="info"){
  const el = $("#status");
  el.textContent = text;
  el.style.display = "block";
  el.style.borderStyle = "solid";
  el.style.borderWidth = "1px";
  el.style.borderRadius = "16px";
  el.style.padding = "12px 14px";
  el.style.marginTop = "12px";
  el.style.background = "rgba(255,255,255,.03)";
  el.style.borderColor = type === "ok" ? "rgba(31,164,90,.45)" : (type==="err" ? "rgba(216,58,58,.45)" : "rgba(255,255,255,.18)");
  el.style.color = type === "err" ? "#ffd1d1" : "#b8b8bf";
}

async function refreshTable(){
  const tbody = $("#tbody");
  tbody.innerHTML = "";
  try{
    const data = await apiList();
    const items = data.items || [];
    if(!items.length){
      tbody.innerHTML = `<tr><td colspan="4">Nenhuma campanha ainda.</td></tr>`;
      return;
    }
    items.forEach(it=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${it.title || "-"}</td>
        <td><a class="btn small" href="${it.url}" target="_blank" rel="noreferrer">Ver</a></td>
        <td>${new Date(it.uploadedAt).toLocaleString("pt-BR")}</td>
        <td><button class="btn small red" data-del="${it.key}">Excluir</button></td>
      `;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll("[data-del]").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        const key = btn.getAttribute("data-del");
        const pin = sessionStorage.getItem("adminPin");
        if(!pin) return setStatus("Você precisa autenticar de novo.", "err");
        if(!confirm("Excluir esta campanha?")) return;
        try{
          await apiDelete(pin, key);
          setStatus("Excluída com sucesso.", "ok");
          refreshTable();
        }catch(e){
          setStatus(String(e.message || e), "err");
        }
      });
    });
  }catch(e){
    tbody.innerHTML = `<tr><td colspan="4">API não disponível (isso é normal antes de publicar no Cloudflare).</td></tr>`;
  }
}

document.addEventListener("DOMContentLoaded", ()=>{
  const loginBox = $("#loginBox");
  const adminBox = $("#adminBox");

  // História
  const bindHistory = ()=>{
    const loadBtn = $("#historyLoadBtn");
    const saveBtn = $("#historySaveBtn");
    if(loadBtn){
      loadBtn.addEventListener("click", async ()=>{
        const pin = sessionStorage.getItem("adminPin") || "";
        if(!pin) return setStatus("Faça login novamente.", "err");
        try{
          await loadHistoryIntoForm();
        }catch(e){
          setStatus("Não foi possível carregar a história.", "err");
        }
      });
    }
    if(saveBtn){
      saveBtn.addEventListener("click", async ()=>{
        const pin = sessionStorage.getItem("adminPin") || "";
        if(!pin) return setStatus("Faça login novamente.", "err");
        const value = ($("#historyText")?.value || "").trim();
        try{
          await apiSetContent(pin, "history", value);
          setStatus("História salva com sucesso.", "ok");
        }catch(e){
          setStatus(e.message || "Falha ao salvar a história.", "err");
        }
      });
    }
  };
  bindHistory();


  $("#pinBtn").addEventListener("click", async ()=>{
    const pin = $("#pin").value.trim();
    if(!pin) return setStatus("Digite o PIN.", "err");
    try{
      const data = await apiAuth(pin);
      if(!data.ok) return setStatus("PIN inválido.", "err");
      sessionStorage.setItem("adminPin", pin);
      loginBox.style.display="none";
      adminBox.style.display="block";
      await loadHistoryIntoForm();
      setStatus("Autenticado. Agora você pode enviar campanhas/eventos.", "ok");
      refreshTable();
    }catch(e){
      setStatus("Falha ao autenticar (publique no Cloudflare Pages para funcionar).", "err");
    }
  });

  $("#file").addEventListener("change", ()=>{
    const f = $("#file").files?.[0];
    const prev = $("#preview");
    if(!f){ prev.style.display="none"; return; }
    prev.src = URL.createObjectURL(f);
    prev.style.display="block";
  });

  $("#uploadBtn").addEventListener("click", async ()=>{
    const pin = sessionStorage.getItem("adminPin");
    if(!pin) return setStatus("Faça login primeiro.", "err");
    const f = $("#file").files?.[0];
    if(!f) return setStatus("Selecione uma imagem.", "err");
    if(!f.type.startsWith("image/")) return setStatus("Envie apenas imagem (JPG/PNG/WebP).", "err");
    if(f.size > 5*1024*1024) return setStatus("Imagem grande demais. Use até 5MB.", "err");

    const title = $("#title").value.trim();
    try{
      $("#uploadBtn").setAttribute("disabled","true");
      setStatus("Enviando...", "info");
      await apiUpload(pin, f, title);
      setStatus("Upload concluído.", "ok");
      $("#title").value="";
      $("#file").value="";
      $("#preview").style.display="none";
      refreshTable();
    }catch(e){
      setStatus(String(e.message || e), "err");
    }finally{
      $("#uploadBtn").removeAttribute("disabled");
    }
  });

  // Mostrar tabela mesmo sem login (com aviso)
  refreshTable();
});