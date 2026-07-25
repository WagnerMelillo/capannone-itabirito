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
  try {
    const q = query(collection(db, "espaco_fotos"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    if (snap.empty) {
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;
    grid.innerHTML = snap.docs
      .map((docSnap) => {
        const data = docSnap.data();
        const caption = (data.caption || "").replace(/"/g, "&quot;");
        const alt = caption || "Foto do Espaço Capannone";
        return `<button type="button" class="gallery-item" data-src="${data.imageBase64}" data-caption="${caption}">
          <img src="${data.imageBase64}" alt="${alt}" loading="lazy">
        </button>`;
      })
      .join("");
    grid.querySelectorAll(".gallery-item").forEach((btn) => {
      btn.addEventListener("click", () => openLightbox(btn.dataset.src, btn.dataset.caption));
    });
  } catch (error) {
    grid.innerHTML = "";
    emptyState.hidden = false;
    emptyState.textContent = "Não foi possível carregar as fotos agora. Tente novamente em instantes.";
  }
}

loadGallery();
