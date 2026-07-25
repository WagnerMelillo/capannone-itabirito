import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const GALLERY_EMAIL = "admin@capannoneitabirito.com";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

function message(selector, text, state = "") {
  const el = document.querySelector(selector);
  if (!el) return;
  el.textContent = text;
  el.dataset.state = state;
}

function resizeImage(file, maxSize = 1400, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Não foi possível ler a imagem."));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round(height * (maxSize / width));
          width = maxSize;
        } else if (height >= width && height > maxSize) {
          width = Math.round(width * (maxSize / height));
          height = maxSize;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function loadGalleryList() {
  const holder = document.querySelector("#gallery-admin-list");
  if (!holder) return;
  holder.innerHTML = '<p class="empty-state">Carregando fotos…</p>';
  try {
    const q = query(collection(db, "espaco_fotos"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    if (snap.empty) {
      holder.innerHTML = '<p class="empty-state">Nenhuma foto publicada ainda.</p>';
      return;
    }
    holder.innerHTML = snap.docs
      .map((docSnap) => {
        const data = docSnap.data();
        const caption = data.caption || "Sem legenda";
        return `<article class="admin-campaign"><img src="${data.imageBase64}" alt="${caption}"><div><h3>${caption}</h3></div><button class="delete-button" type="button" data-id="${docSnap.id}">Remover</button></article>`;
      })
      .join("");
    holder.querySelectorAll("[data-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Remover esta foto do site?")) return;
        try {
          await deleteDoc(doc(db, "espaco_fotos", btn.dataset.id));
          loadGalleryList();
        } catch (error) {
          message("#gallery-upload-message", "Não foi possível remover: " + error.message, "error");
        }
      });
    });
  } catch (error) {
    holder.innerHTML = `<p class="empty-state">${error.message}</p>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const panel = document.querySelector("#gallery-admin-panel");
  if (!panel) return;

  // A galeria não tem login próprio: ela usa o mesmo PIN do painel de campanhas.
  // Assim que o PIN é validado em admin.js, este script tenta conectar à galeria
  // automaticamente, usando o PIN como senha da conta técnica da galeria no Firebase.
  window.addEventListener("capannone-admin-unlocked", async (event) => {
    const pin = event.detail?.pin || "";
    if (!pin) return;
    try {
      await signInWithEmailAndPassword(auth, GALLERY_EMAIL, pin);
      message("#gallery-connection-message", "", "");
    } catch (error) {
      message(
        "#gallery-connection-message",
        "Não foi possível conectar a galeria de fotos com o PIN atual. Se o PIN foi trocado recentemente, atualize também a senha da conta da galeria no Firebase (veja ESTRUTURA-DO-SITE.md, seção 10).",
        "error"
      );
    }
  });

  window.addEventListener("capannone-admin-locked", () => signOut(auth).catch(() => {}));

  document.querySelector("#gallery-refresh-button").addEventListener("click", loadGalleryList);

  document.querySelector("#gallery-image").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    const preview = document.querySelector("#gallery-image-preview");
    if (!file) {
      preview.hidden = true;
      return;
    }
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
  });

  document.querySelector("#gallery-upload-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = document.querySelector("#gallery-image").files?.[0];
    if (!file) {
      message("#gallery-upload-message", "Escolha uma imagem.", "error");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      message("#gallery-upload-message", "Use uma imagem de até 8 MB.", "error");
      return;
    }
    try {
      message("#gallery-upload-message", "Enviando foto…");
      const imageBase64 = await resizeImage(file);
      const caption = document.querySelector("#gallery-caption").value.trim();
      await addDoc(collection(db, "espaco_fotos"), { imageBase64, caption, createdAt: Date.now() });
      event.target.reset();
      document.querySelector("#gallery-image-preview").hidden = true;
      message("#gallery-upload-message", "Foto publicada com sucesso.", "success");
      loadGalleryList();
    } catch (error) {
      message("#gallery-upload-message", "Erro ao publicar: " + error.message, "error");
    }
  });

  onAuthStateChanged(auth, (user) => {
    if (user) loadGalleryList();
  });
});
