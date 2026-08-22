import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { browserSessionPersistence, getAuth, onAuthStateChanged, setPersistence, signInWithEmailAndPassword, signOut, updatePassword } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { addDoc, collection, doc, getDoc, getDocs, getFirestore, orderBy, query, updateDoc, where } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { MEDIA_API } from "./default-content.js";

const SUPERADMIN_UID = "n7YwMAtBWrZmQUkTwfDQr5mnQsB2";
const MAGNA_EMAIL = "magnamelillo@gmail.com";
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const state = { profile: null, employee: null, shifts: [], messages: [], timeEntries: [], hotspotVerified: false, hotspotConfigured: false, calendarDate: new Date(), activeView: "home", toastTimer: null };
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
  await loadTimeEntries(); renderHome(); renderCalendar(); renderMessages();
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

async function checkHotspot() {
  const status = $("#network-status"); status.dataset.state = "checking"; status.querySelector("strong").textContent = "Verificando a rede…"; $("#clock-button").disabled = true;
  try { const response = await authenticatedFetch("/hotspot/status"); const data = await response.json(); state.hotspotConfigured = Boolean(data.configured); state.hotspotVerified = Boolean(data.verified); if (state.hotspotVerified) { status.dataset.state = "ok"; status.querySelector("strong").textContent = "Conectado à rede Capannone Hotspot"; $("#clock-button").disabled = false; } else { status.dataset.state = "blocked"; status.querySelector("strong").textContent = state.hotspotConfigured ? "Conecte-se à rede Capannone Hotspot" : "Relógio aguardando configuração do Hotspot"; } }
  catch (_) { state.hotspotVerified = false; status.dataset.state = "blocked"; status.querySelector("strong").textContent = "Não foi possível confirmar a rede Capannone"; }
}

async function loadTimeEntries() {
  try { const response = await authenticatedFetch("/hotspot/entries?mine=1"); if (!response.ok) throw new Error(); const data = await response.json(); state.timeEntries = Array.isArray(data.items) ? data.items : []; } catch (_) { state.timeEntries = []; }
  renderTimeEntries(); renderHome();
}

function renderTimeEntries() { const holder = $("#my-time-entries"); if (!holder) return; if (!state.timeEntries.length) return holder.replaceChildren(el("p", "compact-empty", "Nenhum ponto registrado.")); holder.replaceChildren(...state.timeEntries.slice(0, 30).map((item) => { const row = el("div", "compact-row"); const copy = el("div"); copy.append(el("strong", "", item.type === "entrada" ? "Entrada" : "Saída"), el("small", "", dateLabel(item.timestamp, true))); row.append(copy, el("span", "badge active", "Hotspot confirmado")); return row; })); }

async function handleClock(event) {
  event.preventDefault(); if (!state.hotspotVerified) return setMessage("#clock-message", "Conecte-se à rede Capannone Hotspot.", "error"); const submit = event.submitter; submit.disabled = true; setMessage("#clock-message", "Confirmando PIN e rede…");
  try { const response = await authenticatedFetch("/hotspot/clock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: $("#phone-pin").value }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Não foi possível registrar o ponto."); $("#phone-pin").value = ""; state.timeEntries.unshift(data.entry); renderTimeEntries(); renderHome(); setMessage("#clock-message", `${data.entry.type === "entrada" ? "Entrada" : "Saída"} registrada às ${new Date(data.entry.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`, "success"); toast("Ponto registrado com a rede e o PIN confirmados."); }
  catch (error) { setMessage("#clock-message", friendlyError(error), "error"); } finally { submit.disabled = !state.hotspotVerified; }
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
