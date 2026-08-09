import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const GALLERY_EMAIL = "magnamelillo@gmail.com";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FIRESTORE_IMAGE_CHARS = 750000;
let galleryPreviewUrl = "";

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
        const render = (targetWidth, targetHeight, targetQuality) => {
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const context = canvas.getContext("2d", { alpha: false });
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, targetWidth, targetHeight);
          context.drawImage(img, 0, 0, targetWidth, targetHeight);
          return canvas.toDataURL("image/jpeg", targetQuality);
        };
        let result = render(width, height, quality);
        for (const factor of [0.85, 0.7, 0.55]) {
          if (result.length <= MAX_FIRESTORE_IMAGE_CHARS) break;
          const nextWidth = Math.max(480, Math.round(width * factor));
          const nextHeight = Math.max(360, Math.round(height * factor));
          result = render(nextWidth, nextHeight, Math.max(0.55, quality * factor));
        }
        if (result.length > MAX_FIRESTORE_IMAGE_CHARS) {
          reject(new Error("A imagem continua grande demais após a otimização."));
          return;
        }
        resolve(result);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function safeDataImage(value) {
  const source = String(value || "").trim();
  return /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(source) ? source : "";
}

function emptyState(text) {
  const paragraph = document.createElement("p");
  paragraph.className = "empty-state";
  paragraph.textContent = text;
  return paragraph;
}

async function loadGalleryList() {
  const holder = document.querySelector("#gallery-admin-list");
  if (!holder) return;
  holder.replaceChildren(emptyState("Carregando fotos…"));
  try {
    const q = query(collection(db, "espaco_fotos"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    if (snap.empty) {
      holder.replaceChildren(emptyState("Nenhuma foto publicada ainda."));
      return;
    }
    const cards = snap.docs.map((docSnap) => {
      const data = docSnap.data();
      const source = safeDataImage(data.imageBase64);
      if (!source) return null;
      const caption = String(data.caption || "Sem legenda").trim().slice(0, 240);
      const article = document.createElement("article");
      article.className = "admin-campaign";
      const image = document.createElement("img");
      image.src = source;
      image.alt = caption;
      image.loading = "lazy";
      const content = document.createElement("div");
      const heading = document.createElement("h3");
      heading.textContent = caption;
      content.append(heading);
      const button = document.createElement("button");
      button.className = "delete-button";
      button.type = "button";
      button.dataset.id = docSnap.id;
      button.textContent = "Remover";
      article.append(image, content, button);
      return article;
    }).filter(Boolean);
    holder.replaceChildren(...cards);
    if (!cards.length) holder.replaceChildren(emptyState("Nenhuma foto válida foi encontrada."));
    holder.querySelectorAll("button[data-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Remover esta foto do site?")) return;
        try {
          await deleteDoc(doc(db, "espaco_fotos", btn.dataset.id));
          loadGalleryList();
        } catch (error) {
          message("#gallery-upload-message", "Não foi possível remover a foto. Tente novamente.", "error");
        }
      });
    });
  } catch (error) {
    holder.replaceChildren(emptyState("Não foi possível carregar as fotos agora."));
  }
}

async function connectGallery(pin) {
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
}

document.addEventListener("DOMContentLoaded", () => {
  const panel = document.querySelector("#gallery-admin-panel");
  if (!panel) return;

  // A galeria não tem login próprio: ela usa o mesmo PIN do painel de campanhas.
  // Assim que o PIN é validado em admin.js, este script tenta conectar à galeria
  // automaticamente, usando o PIN como senha da conta técnica da galeria no Firebase.
  // Como este script é um módulo (carrega o Firebase de forma assíncrona), ele pode
  // terminar de carregar DEPOIS do login já ter acontecido — por isso também checamos
  // se já existe um PIN válido na sessão assim que o módulo termina de carregar.
  window.addEventListener("capannone-admin-unlocked", (event) => connectGallery(event.detail?.pin || ""));
  window.addEventListener("capannone-admin-locked", () => signOut(auth).catch(() => {}));

  const existingPin = sessionStorage.getItem("capannone-admin-pin");
  if (existingPin) connectGallery(existingPin);

  document.querySelector("#gallery-refresh-button").addEventListener("click", loadGalleryList);

  document.querySelector("#gallery-image").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    const preview = document.querySelector("#gallery-image-preview");
    if (galleryPreviewUrl) URL.revokeObjectURL(galleryPreviewUrl);
    galleryPreviewUrl = "";
    if (!file) {
      preview.removeAttribute("src");
      preview.hidden = true;
      return;
    }
    galleryPreviewUrl = URL.createObjectURL(file);
    preview.src = galleryPreviewUrl;
    preview.hidden = false;
  });

  document.querySelector("#gallery-upload-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = document.querySelector("#gallery-image").files?.[0];
    if (!file) {
      message("#gallery-upload-message", "Escolha uma imagem.", "error");
      return;
    }
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      message("#gallery-upload-message", "Use uma imagem JPG, PNG ou WebP.", "error");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      message("#gallery-upload-message", "Use uma imagem de até 8 MB.", "error");
      return;
    }
    try {
      const submit = event.submitter || event.target.querySelector('[type="submit"]');
      submit.disabled = true;
      message("#gallery-upload-message", "Enviando foto…");
      const imageBase64 = await resizeImage(file);
      const caption = document.querySelector("#gallery-caption").value.trim();
      await addDoc(collection(db, "espaco_fotos"), { imageBase64, caption, createdAt: Date.now() });
      event.target.reset();
      document.querySelector("#gallery-image-preview").hidden = true;
      if (galleryPreviewUrl) URL.revokeObjectURL(galleryPreviewUrl);
      galleryPreviewUrl = "";
      message("#gallery-upload-message", "Foto publicada com sucesso.", "success");
      loadGalleryList();
    } catch (error) {
      message("#gallery-upload-message", error.message || "Não foi possível publicar a foto.", "error");
    } finally {
      const submit = event.submitter || event.target.querySelector('[type="submit"]');
      submit.disabled = false;
    }
  });

  onAuthStateChanged(auth, (user) => {
    if (user) loadGalleryList();
  });
});
