import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore, collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const grid = document.querySelector("#gallery-grid");
const emptyState = document.querySelector("#gallery-empty");
const lightbox = document.querySelector("#lightbox");
const lightboxImg = document.querySelector("#lightbox-img");
const lightboxCaption = document.querySelector("#lightbox-caption");

function safeDataImage(value) {
  const source = String(value || "").trim();
  return /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(source) ? source : "";
}

function openLightbox(src, caption) {
  lightboxImg.src = src;
  lightboxCaption.textContent = caption || "";
  lightbox.hidden = false;
}

document.querySelector("#lightbox-close").addEventListener("click", () => {
  lightbox.hidden = true;
  lightboxImg.src = "";
});
lightbox.addEventListener("click", (event) => {
  if (event.target === lightbox) {
    lightbox.hidden = true;
    lightboxImg.src = "";
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !lightbox.hidden) {
    lightbox.hidden = true;
    lightboxImg.src = "";
  }
});

async function loadGallery() {
  grid.setAttribute("aria-busy", "true");
  try {
    const q = query(collection(db, "espaco_fotos"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    if (snap.empty) {
      grid.replaceChildren();
      emptyState.hidden = false;
      return;
    }
    const items = snap.docs.map((docSnap) => {
      const data = docSnap.data();
      const source = safeDataImage(data.imageBase64);
      if (!source) return null;
      const caption = String(data.caption || "").trim().slice(0, 240);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gallery-item";
      button.setAttribute("aria-label", caption || "Ampliar foto do Espaço Capannone");
      const image = document.createElement("img");
      image.src = source;
      image.alt = caption || "Foto do Espaço Capannone";
      image.loading = "lazy";
      button.append(image);
      button.addEventListener("click", () => openLightbox(source, caption));
      return button;
    }).filter(Boolean);
    grid.replaceChildren(...items);
    emptyState.hidden = items.length > 0;
  } catch (error) {
    grid.replaceChildren();
    emptyState.hidden = false;
    emptyState.textContent = "Não foi possível carregar as fotos agora. Tente novamente em instantes.";
  } finally {
    grid.removeAttribute("aria-busy");
  }
}

loadGallery();
