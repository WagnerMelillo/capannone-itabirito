import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { browserSessionPersistence, getAuth, onAuthStateChanged, setPersistence, signInWithEmailAndPassword, signOut, updatePassword } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { addDoc, collection, doc, getDoc, getDocs, getFirestore, orderBy, query, updateDoc, where } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { MEDIA_API } from "./default-content.js";

const SUPERADMIN_UID = "unHjEmB7jXPGTXhvc2mFB9Iht3h1";
const MAGNA_EMAIL = "magnamelillo@gmail.com";
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const state = { profile: null, employee: null, shifts: [], messages: [], timeEntries: [], hotspotVerified: false, hotspotConfigured: false, deviceReady: false, deviceSetupPromise: null, calendarDate: new Date(), activeView: "home", toastTimer: null };
const DEVICE_DB = "capannone-clock-device";
const DEVICE_STORE = "employee-keys";
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const clean = (value, max = 1000) => String(value ?? "").trim().slice(0, max);
const nowIso = () => new Date().toISOString();

function el(tag, className = "", text = "") { const node = document.createElement(tag); if (className) node.className = className; if (text !== "") node.textContent = text; return node; }
function setMessage(selector, text = "", type = "") { const target = $(selector); if (!target) return; target.textContent = text; target.dataset.state = type; }
function friendlyError(error) { const messages = { "auth/invalid-credential": "E-mail ou senha inválidos.", "auth/invalid-email": "Confira o endereço de e-mail.", "auth/weak-password": "A senha precisa ser mais forte.", "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos.", "permission-denied": "Seu acesso não permite esta ação.", "firestore/permission-denied": "Seu acesso não permite esta ação." }; return messages[error?.code] || clean(error?.message || "Não foi possível concluir esta ação.", 260); }
function toast(text, type = "success") { const target = $("#employee-toast"); clearTimeout(state.toastTimer); target.textContent = text; target.dataset.state = type; target.hidden = false; state.toastTimer = setTimeout(() => { target.hidden = true; }, 4500); }
function dateLabel(value, withTime = false) { if (!value) return "—"; const date = new Date(withTime ? value : `${value}T12:00:00`); if (Number.isNaN(date.getTime())) return "—"; return new Intl.DateTimeFormat("pt-BR", withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" }).format(date); }
function showAuthView(view) { $("#login-view").hidden = view !== "login"; $("#password-view").hidden = view !== "password"; $("#employee-app").hidden = view !== "app"; $("#logout-button").hidden = view === "login"; $("#user-summary").hidden = view === "login"; }
function switchView(name) { const allowed = new Set(["home", "calendar", "clock", "chat"]); state.activeView = allowed.has(name) ? name : "home"; $$(".admin-view").forEach((view) => { view.hidden = view.dataset.view !== state.activeView; }); $$('[data-employee-view]').forEach((control) => control.classList.toggle("active", control.dataset.employeeView === state.activeView)); if (state.activeView === "home") renderHome(); if (state.activeView === "calendar") renderCalendar(); if (state.activeView === "clock") { checkHotspot(); renderTimeEntries(); } if (state.activeView === "chat") renderMessages(); window.scrollTo({ top: 0, behavior: "smooth" }); }

async function loadData() {
  const [employeeDoc, shiftDocs, messageDocs] = await Promise.all([
    getDoc(doc(db, "employees", auth.currentUser.uid)),
    getDocs(query(collection(db, "workShifts"), where("employeeId", "==", auth.currentUser.uid))),
    getDocs(query(collection(db, "staffMessages"), orderBy("createdAt", "asc")))
  ]);
  if (!employeeDoc.exists()) throw new Error("Seu cadastro de funcionário ainda não foi concluído pela Magna.");
  state.employee = { id: employeeDoc.id, ...employeeDoc.data() };
  state.shifts = shiftDocs.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => clean(a.date).localeCompare(clean(b.date)) || clean(a.startTime).localeCompare(clean(b.startTime)));
  state.messages = messageDocs.docs.map((item) => ({ id: item.id, ...item.data() }));
  await loadTimeEntries(); renderHome(); renderCalendar(); renderMessages(); await prepareDeviceBinding();
}

function renderHome() {
  const today = new Date().toISOString().slice(0, 10); const next = state.shifts.find((item) => item.date >= today);
  $("#next-shift-date").textContent = next ? dateLabel(next.date) : "—"; $("#next-shift-hours").textContent = next ? `${next.startTime || "—"} às ${next.endTime || "—"}` : "sem escala";
  const vacation = state.employee?.vacationStart || state.employee?.vacationEnd; $("#vacation-status").textContent = vacation ? "Programadas" : "—"; $("#vacation-dates").textContent = vacation ? `${dateLabel(state.employee.vacationStart)} a ${dateLabel(state.employee.vacationEnd)}` : "não programadas";
  const last = state.timeEntries[0]; $("#last-clock-type").textContent = last ? (last.type === "entrada" ? "Entrada" : "Saída") : "—"; $("#last-clock-date").textContent = last ? dateLabel(last.timestamp, true) : "nenhum registro";
  const holder = $("#next-shifts"); const upcoming = state.shifts.filter((item) => item.date >= today).slice(0, 8); if (!upcoming.length) holder.replaceChildren(el("p", "compact-empty", "Nenhum dia programado.")); else holder.replaceChildren(...upcoming.map((item) => { const row = el("div", "compact-row"); const copy = el("div"); copy.append(el("strong", "", dateLabel(item.date)), el("small", "", item.note || "Dia de trabalho")); row.append(copy, el("strong", "", `${item.startTime || "—"}–${item.endTime || "—"}`)); return row; }));
}

function easterDate(year) {
  const a = year % 19; const b = Math.floor(year / 100); const c = year % 100; const d = Math.floor(b / 4); const e = b % 4; const f = Math.floor((b + 8) / 25); const g = Math.floor((b - f + 1) / 3); const h = (19 * a + b - d - g + 15) % 30; const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - h - k) % 7; const m = Math.floor((a + 11 * h + 22 * l) / 451); const month = Math.floor((h + l - 7 * m + 114) / 31); const day = ((h + l - 7 * m + 114) % 31) + 1; return new Date(year, month - 1, day, 12);
}

function holidayMap(year) {
  const map = new Map([[`${year}-01-01`, "Confraternização Universal"], [`${year}-04-21`, "Tiradentes"], [`${year}-05-01`, "Dia do Trabalho"], [`${year}-09-07`, "Independência do Brasil"], [`${year}-10-12`, "Nossa Senhora Aparecida"], [`${year}-11-02`, "Finados"], [`${year}-11-15`, "Proclamação da República"], [`${year}-11-20`, "Consciência Negra"], [`${year}-12-25`, "Natal"]]);
  const goodFriday = easterDate(year); goodFriday.setDate(goodFriday.getDate() - 2); map.set(goodFriday.toISOString().slice(0, 10), "Sexta-feira da Paixão"); return map;
}

function renderCalendar() {
  const year = state.calendarDate.getFullYear(); const month = state.calendarDate.getMonth(); $("#calendar-title").textContent = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(state.calendarDate);
  const holder = $("#work-calendar"); const nodes = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((label) => el("div", "calendar-weekday", label)); const first = new Date(year, month, 1, 12); const start = new Date(year, month, 1 - first.getDay(), 12); const holidays = holidayMap(year);
  for (let index = 0; index < 42; index += 1) { const date = new Date(start); date.setDate(start.getDate() + index); const key = date.toISOString().slice(0, 10); const shifts = state.shifts.filter((item) => item.date === key); const outside = date.getMonth() !== month; const sunday = date.getDay() === 0; const holiday = holidays.get(key); const day = el("div", `calendar-day${outside ? " outside" : ""}${sunday ? " sunday" : ""}${holiday ? " holiday" : ""}${shifts.length ? " workday" : ""}`); day.append(el("span", "calendar-day-number", String(date.getDate()))); if (holiday) day.append(el("span", "calendar-day-note", holiday)); shifts.forEach((shift) => day.append(el("span", "calendar-day-note", `${shift.startTime || "—"}–${shift.endTime || "—"}`))); nodes.push(day); }
  holder.replaceChildren(...nodes);
}

async function authenticatedFetch(path, options = {}) {
  const token = await auth.currentUser.getIdToken(); return fetch(`${MEDIA_API}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) }, cache: "no-store", credentials: "omit" });
}

function openDeviceDatabase() {
  return new Promise((resolve, reject) => { const request = indexedDB.open(DEVICE_DB, 1); request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(DEVICE_STORE)) request.result.createObjectStore(DEVICE_STORE, { keyPath: "uid" }); }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error || new Error("Não foi possível guardar a identificação deste aparelho.")); });
}

async function storedDevice(uid) {
  const database = await openDeviceDatabase();
  return new Promise((resolve, reject) => { const transaction = database.transaction(DEVICE_STORE, "readonly"); const request = transaction.objectStore(DEVICE_STORE).get(uid); request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error); transaction.oncomplete = () => database.close(); });
}

async function saveDevice(record) {
  const database = await openDeviceDatabase();
  return new Promise((resolve, reject) => { const transaction = database.transaction(DEVICE_STORE, "readwrite"); transaction.objectStore(DEVICE_STORE).put(record); transaction.oncomplete = () => { database.close(); resolve(); }; transaction.onerror = () => { database.close(); reject(transaction.error); }; });
}

function base64Url(value) { let binary = ""; new Uint8Array(value).forEach((byte) => { binary += String.fromCharCode(byte); }); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }

async function createDeviceKeys() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]); const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey); const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey); const privateKey = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]); privateJwk.d = ""; return { publicKey, privateKey };
}

async function signedChallenge(action, privateKey) {
  const response = await authenticatedFetch("/hotspot/device/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Não foi possível confirmar a segurança do aparelho."); const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, new TextEncoder().encode(data.challenge)); return { challengeId: data.challengeId, signature: base64Url(signature) };
}

function showNetwork(stateName, text) { const target = $("#network-status"); target.dataset.state = stateName; target.querySelector("strong").textContent = text; }
function showDevice(stateName, title, detail) { const target = $("#device-status"); target.dataset.state = stateName; target.querySelector("strong").textContent = title; target.querySelector("small").textContent = detail; }

async function enrollCurrentDevice() {
  const keys = await createDeviceKeys(); const proof = await signedChallenge("enroll", keys.privateKey); const response = await authenticatedFetch("/hotspot/device/enroll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicKey: keys.publicKey, ...proof }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Não foi possível cadastrar este aparelho."); await saveDevice({ uid: auth.currentUser.uid, deviceId: data.device.deviceId, privateKey: keys.privateKey, publicKey: keys.publicKey, enrolledAt: data.device.enrolledAt }); return data.device;
}

async function runDeviceBinding() {
  state.deviceReady = false; $("#clock-button").disabled = true; showNetwork("checking", "Verificando a rede…"); showDevice("checking", "Verificando este aparelho…", "Nenhum PIN ou dado pessoal do telefone é lido.");
  const response = await authenticatedFetch("/hotspot/device"); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Não foi possível validar o acesso."); state.hotspotConfigured = Boolean(data.network?.configured); state.hotspotVerified = Boolean(data.network?.verified);
  if (!state.hotspotVerified) { showNetwork("blocked", state.hotspotConfigured ? "Conecte-se à rede Capannone Hotspot" : "Relógio aguardando configuração do Hotspot"); showDevice("blocked", "Aguardando a rede autorizada", "O aparelho só pode ser cadastrado ou usado dentro da Capannone."); return; }
  showNetwork("ok", "Conectado à rede Capannone Hotspot"); let local = await storedDevice(auth.currentUser.uid);
  if (!data.device) { showDevice("checking", "Cadastrando este aparelho…", "Este procedimento acontece somente no primeiro acesso."); const enrolled = await enrollCurrentDevice(); local = await storedDevice(auth.currentUser.uid); data.device = enrolled; }
  if (!local || local.deviceId !== data.device.deviceId || !local.privateKey) { showDevice("blocked", "Conta vinculada a outro aparelho", "Peça à Magna para liberar a troca de celular."); return; }
  state.deviceReady = true; showDevice("ok", "Aparelho reconhecido", `Cadastro seguro confirmado em ${dateLabel(data.device.enrolledAt, true)}.`); $("#clock-button").disabled = false;
}

async function prepareDeviceBinding() {
  if (!auth.currentUser || state.profile?.role !== "employee") return;
  if (state.deviceSetupPromise) return state.deviceSetupPromise;
  state.deviceSetupPromise = runDeviceBinding().catch((error) => { state.deviceReady = false; $("#clock-button").disabled = true; showNetwork("blocked", "Não foi possível concluir a verificação"); showDevice("blocked", "Aparelho não confirmado", friendlyError(error)); }).finally(() => { state.deviceSetupPromise = null; }); return state.deviceSetupPromise;
}

const checkHotspot = prepareDeviceBinding;

async function loadTimeEntries() {
  try { const response = await authenticatedFetch("/hotspot/entries?mine=1"); if (!response.ok) throw new Error(); const data = await response.json(); state.timeEntries = Array.isArray(data.items) ? data.items : []; } catch (_) { state.timeEntries = []; }
  renderTimeEntries(); renderHome();
}

function renderTimeEntries() { const holder = $("#my-time-entries"); if (!holder) return; if (!state.timeEntries.length) return holder.replaceChildren(el("p", "compact-empty", "Nenhum ponto registrado.")); holder.replaceChildren(...state.timeEntries.slice(0, 30).map((item) => { const row = el("div", "compact-row"); const copy = el("div"); copy.append(el("strong", "", item.type === "entrada" ? "Entrada" : "Saída"), el("small", "", dateLabel(item.timestamp, true))); row.append(copy, el("span", "badge active", "Hotspot confirmado")); return row; })); }

async function handleClock(event) {
  event.preventDefault(); await prepareDeviceBinding(); if (!state.hotspotVerified || !state.deviceReady) return setMessage("#clock-message", "A rede e este aparelho precisam estar reconhecidos.", "error"); const submit = event.submitter; submit.disabled = true; setMessage("#clock-message", "Confirmando rede e aparelho…");
  try { const local = await storedDevice(auth.currentUser.uid); if (!local?.privateKey) throw new Error("A identificação deste aparelho não foi encontrada."); const proof = await signedChallenge("clock", local.privateKey); const response = await authenticatedFetch("/hotspot/clock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(proof) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Não foi possível registrar o ponto."); state.timeEntries.unshift(data.entry); renderTimeEntries(); renderHome(); setMessage("#clock-message", `${data.entry.type === "entrada" ? "Entrada" : "Saída"} registrada às ${new Date(data.entry.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`, "success"); toast("Ponto registrado com a rede e o aparelho confirmados."); }
  catch (error) { setMessage("#clock-message", friendlyError(error), "error"); } finally { submit.disabled = !state.deviceReady; }
}

function renderMessages() { const holder = $("#chat-messages"); if (!state.messages.length) return holder.replaceChildren(el("p", "compact-empty", "Nenhum recado enviado.")); holder.replaceChildren(...state.messages.map((item) => { const message = el("article", `chat-message${item.senderUid === auth.currentUser?.uid ? " mine" : ""}`); message.append(el("strong", "", item.senderName || item.senderEmail || "Equipe"), el("p", "", item.text), el("time", "", dateLabel(item.createdAt, true))); return message; })); holder.scrollTop = holder.scrollHeight; }
async function handleChat(event) { event.preventDefault(); const text = clean($("#chat-text").value, 1000); if (!text) return; const submit = event.submitter; submit.disabled = true; try { const record = { text, senderUid: auth.currentUser.uid, senderEmail: auth.currentUser.email || "", senderName: state.profile.displayName || "Funcionário", senderRole: "employee", createdAt: nowIso() }; const created = await addDoc(collection(db, "staffMessages"), record); state.messages.push({ id: created.id, ...record }); event.target.reset(); renderMessages(); } catch (error) { toast(friendlyError(error), "error"); } finally { submit.disabled = false; } }

function updateClock() { const date = new Date(); $("#clock-time").textContent = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); $("#clock-date").textContent = date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }); }
function enableTemporaryPasswordReveal() { $$('input[type="password"]').forEach((input) => { if (input.closest(".password-control")) return; const control = el("div", "password-control"); input.parentNode.insertBefore(control, input); control.append(input); const button = el("button", "password-reveal"); button.type = "button"; button.setAttribute("aria-label", "Manter pressionado para visualizar"); button.setAttribute("aria-controls", input.id); button.setAttribute("aria-pressed", "false"); button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.4 5.5-9.5 5.5S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.7"/><path class="password-reveal-slash" d="M4 4l16 16"/></svg>'; const reveal = () => { input.type = "text"; button.classList.add("is-revealing"); button.setAttribute("aria-pressed", "true"); }; const conceal = () => { input.type = "password"; button.classList.remove("is-revealing"); button.setAttribute("aria-pressed", "false"); }; button.addEventListener("pointerdown", (event) => { event.preventDefault(); button.setPointerCapture?.(event.pointerId); reveal(); }); ["pointerup", "pointercancel", "pointerleave", "lostpointercapture"].forEach((name) => button.addEventListener(name, conceal)); button.addEventListener("keydown", (event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); reveal(); } }); button.addEventListener("keyup", conceal); button.addEventListener("click", (event) => { event.preventDefault(); conceal(); }); button.addEventListener("blur", conceal); window.addEventListener("blur", conceal); control.append(button); }); }

function wireUi() {
  enableTemporaryPasswordReveal(); updateClock(); setInterval(updateClock, 1000);
  $("#login-form").addEventListener("submit", async (event) => { event.preventDefault(); const submit = event.submitter; submit.disabled = true; setMessage("#login-message", "Entrando…"); try { await signInWithEmailAndPassword(auth, clean($("#login-email").value, 200).toLowerCase(), $("#login-password").value); event.target.reset(); } catch (error) { setMessage("#login-message", friendlyError(error), "error"); } finally { submit.disabled = false; } });
  $("#password-form").addEventListener("submit", async (event) => { event.preventDefault(); const password = $("#new-password").value; if (password !== $("#confirm-password").value) return setMessage("#password-message", "As senhas não coincidem.", "error"); if (!/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) return setMessage("#password-message", "Use letras e números na nova senha.", "error"); const submit = event.submitter; submit.disabled = true; try { await updatePassword(auth.currentUser, password); await updateDoc(doc(db, "users", auth.currentUser.uid), { mustChangePassword: false, passwordChangedAt: nowIso(), updatedAt: nowIso() }); state.profile.mustChangePassword = false; event.target.reset(); showAuthView("app"); await loadData(); switchView("home"); } catch (error) { setMessage("#password-message", friendlyError(error), "error"); } finally { submit.disabled = false; } });
  $("#logout-button").addEventListener("click", () => signOut(auth)); $$('[data-employee-view]').forEach((control) => control.addEventListener("click", () => switchView(control.dataset.employeeView))); $("#previous-month").addEventListener("click", () => { state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() - 1, 1, 12); renderCalendar(); }); $("#next-month").addEventListener("click", () => { state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() + 1, 1, 12); renderCalendar(); }); $("#clock-form").addEventListener("submit", handleClock); $("#chat-form").addEventListener("submit", handleChat);
}

wireUi(); setPersistence(auth, browserSessionPersistence).catch(() => {});
onAuthStateChanged(auth, async (user) => {
  setMessage("#login-message"); if (!user) { state.profile = null; showAuthView("login"); return; }
  try { const profileDoc = await getDoc(doc(db, "users", user.uid)); if (!profileDoc.exists()) throw new Error("Este usuário não foi autorizado."); state.profile = { id: profileDoc.id, ...profileDoc.data() }; if (!state.profile.active) throw new Error("Este acesso foi removido. Fale com a Magna."); if (state.profile.role !== "employee") { const internal = user.uid === SUPERADMIN_UID || clean(state.profile.email).toLowerCase() === MAGNA_EMAIL; location.replace(internal ? "/magna" : "/marketing"); return; } $("#user-summary").textContent = `${state.profile.displayName || user.email} · Funcionário`; $("#welcome-name").textContent = clean(state.profile.displayName || user.email?.split("@")[0] || "equipe", 80).split(" ")[0]; if (state.profile.mustChangePassword) { showAuthView("password"); return; } showAuthView("app"); await loadData(); switchView("home"); }
  catch (error) { await signOut(auth).catch(() => {}); showAuthView("login"); setMessage("#login-message", friendlyError(error), "error"); }
});
