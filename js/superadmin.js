import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  inMemoryPersistence,
  onAuthStateChanged,
  setPersistence,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { addDoc, collection, doc, getDoc, getDocs, getFirestore, setDoc, updateDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const MAGNA_UID = "unHjEmB7jXPGTXhvc2mFB9Iht3h1";
const MAGNA_EMAIL = "magnamelillo@gmail.com";
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const secondaryApp = initializeApp(firebaseConfig, "capannone-marketing-access-management");
const secondaryAuth = getAuth(secondaryApp);
const state = { profile: null, users: [], toastTimer: null };

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const clean = (value, max = 1000) => String(value ?? "").trim().slice(0, max);
const nowIso = () => new Date().toISOString();
const isMagnaSuperadmin = () => Boolean(auth.currentUser?.uid === MAGNA_UID && state.profile?.role === "superadmin" && state.profile?.active && state.profile?.mustChangePassword === false && clean(state.profile?.email).toLowerCase() === MAGNA_EMAIL);

function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== "") node.textContent = text;
  return node;
}

function setMessage(text = "", type = "") {
  const target = $("#user-message");
  target.textContent = text;
  target.dataset.state = type;
}

function toast(text, type = "success") {
  const target = $("#superadmin-toast");
  clearTimeout(state.toastTimer);
  target.textContent = text;
  target.dataset.state = type;
  target.hidden = false;
  state.toastTimer = setTimeout(() => { target.hidden = true; }, 4500);
}

function friendlyError(error) {
  const messages = {
    "auth/email-already-in-use": "Já existe uma pessoa com este e-mail.",
    "auth/invalid-email": "Confira o endereço de e-mail.",
    "auth/weak-password": "A senha provisória precisa ser mais forte.",
    "permission-denied": "Esta ação é exclusiva da Magna.",
    "firestore/permission-denied": "Esta ação é exclusiva da Magna."
  };
  return messages[error?.code] || clean(error?.message || "Não foi possível concluir esta ação.", 260);
}

function badge(text, tone = "") {
  return el("span", `badge ${tone}`.trim(), text);
}

function actionButton(text, action, id, danger = false) {
  const button = el("button", `small-action${danger ? " danger" : ""}`, text);
  button.type = "button";
  button.dataset.action = action;
  button.dataset.id = id;
  return button;
}

async function audit(action, targetUid, details = {}) {
  await addDoc(collection(db, "auditLogs"), {
    action,
    entityType: "user",
    entityId: targetUid,
    actorUid: auth.currentUser.uid,
    actorEmail: auth.currentUser.email || "",
    actorRole: state.profile.role,
    details,
    createdAt: nowIso()
  }).catch(() => {});
}

async function loadUsers() {
  if (!isMagnaSuperadmin()) return;
  const snapshot = await getDocs(collection(db, "users"));
  state.users = snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((item) => ["admin", "employee"].includes(item.role))
    .sort((a, b) => clean(a.displayName || a.email).localeCompare(clean(b.displayName || b.email), "pt-BR"));
  renderUsers();
}

function renderUserGroup(role, holderSelector, countSelector, emptyText) {
  const holder = $(holderSelector);
  const users = state.users.filter((item) => item.role === role);
  const activeCount = users.filter((item) => item.active).length;
  $(countSelector).textContent = `${activeCount} ${activeCount === 1 ? "acesso ativo" : "acessos ativos"}.`;
  if (!users.length) return holder.replaceChildren(el("div", "list-empty", emptyText));
  holder.replaceChildren(...users.map((item) => {
    const card = el("article", "list-card no-image");
    const content = el("div");
    content.append(el("h3", "", item.displayName || item.email), el("p", "", item.email));
    const meta = el("div", "list-card-meta");
    meta.append(badge(role === "employee" ? "Funcionário" : "Equipe de marketing"), badge(item.active ? "Acesso ativo" : "Acesso removido", item.active ? "active" : "ended"));
    if (item.mustChangePassword) meta.append(badge("Troca de senha pendente", "warning"));
    content.append(meta);
    const actions = el("div", "list-card-actions");
    actions.append(actionButton("Exigir troca no próximo acesso", "require-password", item.id), actionButton(item.active ? "Remover acesso" : "Restaurar acesso", "toggle-user", item.id, item.active));
    card.append(content, actions);
    return card;
  }));
}

function renderUsers() {
  renderUserGroup("admin", "#marketing-user-list", "#marketing-user-count", "Nenhum usuário de marketing cadastrado.");
  renderUserGroup("employee", "#employee-user-list", "#employee-user-count", "Nenhum funcionário cadastrado.");
}

async function createMarketingUser(event) {
  event.preventDefault();
  if (!isMagnaSuperadmin()) return location.replace("/magna");
  const submit = event.submitter;
  submit.disabled = true;
  setMessage("Criando acesso…");
  try {
    const displayName = clean($("#user-name").value, 100);
    const email = clean($("#user-email").value, 200).toLowerCase();
    const password = $("#user-temp-password").value;
    if (!displayName) throw new Error("Informe o nome da pessoa.");
    if (email === MAGNA_EMAIL) throw new Error("Este e-mail pertence à Magna.");
    if (password.length < 10 || !/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) throw new Error("Use ao menos 10 caracteres, com letras e números.");
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    try {
      const timestamp = nowIso();
      const record = { displayName, email, role: "admin", active: true, mustChangePassword: true, createdAt: timestamp, createdBy: auth.currentUser.uid, updatedAt: timestamp, updatedBy: auth.currentUser.uid };
      await setDoc(doc(db, "users", credential.user.uid), record);
      state.users.push({ id: credential.user.uid, ...record });
      state.users.sort((a, b) => clean(a.displayName || a.email).localeCompare(clean(b.displayName || b.email), "pt-BR"));
      await audit("create", credential.user.uid, { email });
    } catch (error) {
      await deleteUser(credential.user).catch(() => {});
      throw error;
    } finally {
      await signOut(secondaryAuth).catch(() => {});
    }
    event.target.reset();
    $("#user-dialog").close();
    renderUsers();
    toast("Acesso criado. Entregue a senha provisória diretamente à pessoa.");
  } catch (error) {
    if (secondaryAuth.currentUser) await deleteUser(secondaryAuth.currentUser).catch(() => signOut(secondaryAuth).catch(() => {}));
    setMessage(friendlyError(error), "error");
  } finally {
    submit.disabled = false;
  }
}

async function handleUserAction(control) {
  if (!isMagnaSuperadmin()) return location.replace("/magna");
  const item = state.users.find((candidate) => candidate.id === control.dataset.id);
  if (!item) return;
  if (control.dataset.action === "require-password") {
    control.disabled = true;
    await updateDoc(doc(db, "users", item.id), { mustChangePassword: true, updatedAt: nowIso(), updatedBy: auth.currentUser.uid });
    item.mustChangePassword = true;
    await audit("require-password-change", item.id);
    renderUsers();
    return toast("A troca de senha será obrigatória no próximo acesso.");
  }
  if (control.dataset.action === "toggle-user") {
    const nextActive = !item.active;
    if (!confirm(nextActive ? `Restaurar o acesso de ${item.email}?` : `Remover o acesso de ${item.email}?`)) return;
    control.disabled = true;
    const update = { active: nextActive, updatedAt: nowIso(), updatedBy: auth.currentUser.uid };
    if (item.role === "employee") {
      const batch = writeBatch(db);
      batch.update(doc(db, "users", item.id), update);
      batch.update(doc(db, "employees", item.id), update);
      await batch.commit();
    } else {
      await updateDoc(doc(db, "users", item.id), update);
    }
    item.active = nextActive;
    await audit(nextActive ? "restore-access" : "revoke-access", item.id, { active: nextActive });
    renderUsers();
    toast(nextActive ? "Acesso restaurado." : "Acesso removido imediatamente.");
  }
}

function enablePasswordReveal() {
  $$('input[type="password"]').forEach((input) => {
    const control = el("div", "password-control");
    input.parentNode.insertBefore(control, input);
    control.append(input);
    const button = el("button", "password-reveal");
    button.type = "button";
    button.setAttribute("aria-label", "Manter pressionado para visualizar a senha");
    button.setAttribute("aria-controls", input.id);
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.4 5.5-9.5 5.5S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.7"/><path class="password-reveal-slash" d="M4 4l16 16"/></svg>';
    const reveal = () => { input.type = "text"; button.classList.add("is-revealing"); button.setAttribute("aria-pressed", "true"); };
    const conceal = () => { input.type = "password"; button.classList.remove("is-revealing"); button.setAttribute("aria-pressed", "false"); };
    button.addEventListener("pointerdown", (event) => { event.preventDefault(); button.setPointerCapture?.(event.pointerId); reveal(); });
    ["pointerup", "pointercancel", "pointerleave", "lostpointercapture"].forEach((name) => button.addEventListener(name, conceal));
    button.addEventListener("keydown", (event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); reveal(); } });
    button.addEventListener("keyup", conceal);
    button.addEventListener("click", (event) => { event.preventDefault(); conceal(); });
    button.addEventListener("blur", conceal);
    window.addEventListener("blur", conceal);
    control.append(button);
  });
}

function wireUi() {
  enablePasswordReveal();
  $("#new-user-button").addEventListener("click", () => { $("#user-form").reset(); setMessage(); $("#user-dialog").showModal(); });
  $("#cancel-user").addEventListener("click", () => $("#user-dialog").close());
  $("#user-form").addEventListener("submit", createMarketingUser);
  $("#refresh-users").addEventListener("click", async () => { await loadUsers(); toast("Acessos atualizados."); });
  ["#marketing-user-list", "#employee-user-list"].forEach((selector) => $(selector).addEventListener("click", (event) => { const control = event.target.closest("button[data-action]"); if (control) handleUserAction(control).catch((error) => toast(friendlyError(error), "error")); }));
  $("#logout-button").addEventListener("click", () => signOut(auth));
}

wireUi();
setPersistence(auth, browserSessionPersistence).catch(() => {});
setPersistence(secondaryAuth, inMemoryPersistence).catch(() => {});
onAuthStateChanged(auth, async (user) => {
  if (!user) return location.replace("/magna");
  try {
    const profileDocument = await getDoc(doc(db, "users", user.uid));
    if (!profileDocument.exists()) throw new Error("Perfil não autorizado.");
    state.profile = { id: profileDocument.id, ...profileDocument.data() };
    if (!isMagnaSuperadmin()) return location.replace("/magna");
    $("#user-summary").textContent = `${state.profile.displayName || "Magna"} · Super-administradora`;
    $("#user-summary").hidden = false;
    $("#logout-button").hidden = false;
    $("#access-loading").hidden = true;
    $("#superadmin-app").hidden = false;
    await loadUsers();
  } catch (_) {
    location.replace("/magna");
  }
});
