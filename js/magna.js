import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  inMemoryPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updatePassword
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { MEDIA_API } from "./default-content.js";

const SUPERADMIN_UID = "unHjEmB7jXPGTXhvc2mFB9Iht3h1";
const MAGNA_EMAIL = "magnamelillo@gmail.com";
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const employeeApp = initializeApp(firebaseConfig, "capannone-employee-management");
const employeeAuth = getAuth(employeeApp);

const state = {
  profile: null,
  employees: [],
  payments: [],
  inventory: [],
  recipes: [],
  versions: [],
  shifts: [],
  messages: [],
  timeEntries: [],
  deviceRegistrations: new Map(),
  recipeEditorMode: "recheios",
  selectedInventory: new Set(),
  selectedRecipes: new Set(),
  activeView: "dashboard",
  toastTimer: null
};

const inventoryCategories = [
  "Carnes e embutidos",
  "Laticínios e frios",
  "Farinhas, massas e panificação",
  "Hortifrúti",
  "Molhos, conservas e temperos",
  "Óleos, grãos e insumos secos",
  "Bebidas não alcoólicas",
  "Cervejas, vinhos e destilados",
  "Doces e sobremesas",
  "Congelados e pré-preparos",
  "Descartáveis e embalagens",
  "Limpeza e higiene",
  "Equipamentos e utensílios",
  "Outros"
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const clean = (value, max = 1000) => String(value ?? "").trim().slice(0, max);
const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const nowIso = () => new Date().toISOString();
const isSuperadmin = () => Boolean(auth.currentUser?.uid === SUPERADMIN_UID && state.profile?.role === "superadmin" && state.profile?.active);
const isMagna = () => Boolean(["admin", "superadmin"].includes(state.profile?.role) && clean(state.profile?.email).toLowerCase() === MAGNA_EMAIL && state.profile?.active);
const isInternalManager = () => Boolean((isMagna() || isSuperadmin()) && state.profile?.mustChangePassword === false);

function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== "") node.textContent = text;
  return node;
}

function setMessage(selector, text = "", type = "") {
  const target = $(selector);
  if (!target) return;
  target.textContent = text;
  target.dataset.state = type;
}

function friendlyError(error) {
  const messages = {
    "auth/invalid-credential": "E-mail ou senha inválidos.",
    "auth/invalid-email": "Confira o endereço de e-mail.",
    "auth/email-already-in-use": "Já existe uma pessoa com este e-mail.",
    "auth/weak-password": "A senha precisa ser mais forte.",
    "auth/requires-recent-login": "Saia e entre novamente antes de trocar a senha.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos.",
    "permission-denied": "Seu perfil não tem permissão para esta ação.",
    "firestore/permission-denied": "Seu perfil não tem permissão para esta ação."
  };
  return messages[error?.code] || clean(error?.message || "Não foi possível concluir esta ação.", 260);
}

function toast(text, type = "success") {
  const target = $("#internal-toast");
  clearTimeout(state.toastTimer);
  target.textContent = text;
  target.dataset.state = type;
  target.hidden = false;
  state.toastTimer = setTimeout(() => { target.hidden = true; }, 4500);
}

function money(value) {
  return num(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateLabel(value, withTime = false) {
  if (!value) return "—";
  const date = new Date(withTime ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" }).format(date);
}

function empty(text) {
  return el("div", "list-empty", text);
}

function badge(text, tone = "") {
  return el("span", `badge ${tone}`.trim(), text);
}

function button(text, action, id, className = "small-action") {
  const control = el("button", className, text);
  control.type = "button";
  control.dataset.action = action;
  control.dataset.id = id;
  return control;
}

function showAuthView(view) {
  $("#login-view").hidden = view !== "login";
  $("#password-view").hidden = view !== "password";
  $("#internal-app").hidden = view !== "app";
  $("#logout-button").hidden = view === "login";
  $("#user-summary").hidden = view === "login";
}

function applyRoleVisibility() {
  $$(".superadmin-only").forEach((node) => { node.hidden = !isSuperadmin(); });
  $$(".magna-only").forEach((node) => { node.hidden = !isMagna(); });
}

function switchView(name) {
  const allowed = new Set(["dashboard", "people", "payments", "inventory", "recipes", "schedule", "chat"]);
  state.activeView = allowed.has(name) ? name : "dashboard";
  $$(".admin-view").forEach((view) => { view.hidden = view.dataset.view !== state.activeView; });
  $$('[data-internal-view]').forEach((control) => control.classList.toggle("active", control.dataset.internalView === state.activeView));
  if (state.activeView === "dashboard") renderDashboard();
  if (state.activeView === "people") renderEmployees();
  if (state.activeView === "payments") renderPayments();
  if (state.activeView === "inventory") renderInventory();
  if (state.activeView === "recipes") renderRecipes();
  if (state.activeView === "schedule") { renderShifts(); renderTimeEntries(); }
  if (state.activeView === "chat") renderMessages();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadCollection(name, orderedField = "") {
  const source = orderedField ? query(collection(db, name), orderBy(orderedField, "asc")) : collection(db, name);
  const snapshot = await getDocs(source);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

async function loadAllData() {
  if (!isInternalManager()) return;
  const [employees, payments, inventory, recipes, versions, shifts, messages] = await Promise.all([
    loadCollection("employees"), loadCollection("internalPayments"), loadCollection("inventoryItems"),
    loadCollection("recipes"), loadCollection("recipeVersions"), loadCollection("workShifts"),
    loadCollection("staffMessages", "createdAt")
  ]);
  state.employees = employees.sort((a, b) => clean(a.displayName).localeCompare(clean(b.displayName), "pt-BR"));
  state.payments = payments.sort((a, b) => clean(a.dueDate).localeCompare(clean(b.dueDate)));
  state.inventory = inventory.sort((a, b) => clean(a.name).localeCompare(clean(b.name), "pt-BR"));
  state.recipes = recipes.sort((a, b) => clean(a.name).localeCompare(clean(b.name), "pt-BR"));
  state.selectedInventory = new Set([...state.selectedInventory].filter((id) => state.inventory.some((item) => item.id === id)));
  state.selectedRecipes = new Set([...state.selectedRecipes].filter((id) => state.recipes.some((item) => item.id === id && item.active !== false)));
  state.versions = versions.sort((a, b) => clean(b.versionedAt).localeCompare(clean(a.versionedAt)));
  state.shifts = shifts.sort((a, b) => clean(a.date).localeCompare(clean(b.date)) || clean(a.startTime).localeCompare(clean(b.startTime)));
  state.messages = messages;
  fillEmployeeOptions(); fillInventoryCategoryOptions();
  renderDashboard(); renderEmployees(); renderPayments(); renderInventory(); renderRecipes(); renderShifts(); renderMessages();
  await loadHotspotData();
}

function renderDashboard() {
  $("#metric-employees").textContent = String(state.employees.filter((item) => item.active !== false).length);
  const pending = state.payments.filter((item) => item.status !== "paid");
  $("#metric-payments").textContent = String(pending.length);
  $("#metric-payments-value").textContent = pending.length ? `${money(pending.reduce((sum, item) => sum + num(item.amount), 0))} aguardando` : "nenhuma pendência";
  $("#metric-stock").textContent = String(state.inventory.filter((item) => num(item.currentQuantity) <= num(item.minimumQuantity)).length);
  $("#metric-recipes").textContent = String(state.recipes.filter((item) => item.active !== false).length);
  const upcoming = pending.filter((item) => item.dueDate).slice(0, 5);
  const holder = $("#upcoming-payments");
  if (!upcoming.length) return holder.replaceChildren(el("p", "compact-empty", "Nenhum vencimento pendente."));
  holder.replaceChildren(...upcoming.map((item) => {
    const row = el("div", "compact-row");
    const copy = el("div"); copy.append(el("strong", "", item.title), el("small", "", `${item.category || "Conta"} · ${dateLabel(item.dueDate)}`));
    row.append(copy, el("strong", "", money(item.amount)));
    return row;
  }));
}

function employeePayLabel(item) {
  const frequency = { monthly: "mensal", weekly: "semanal", daily: "por dia", other: "combinado" }[item.payFrequency] || "combinado";
  return `${money(item.payAmount)} · ${frequency}`;
}

function renderEmployees() {
  const holder = $("#employee-list");
  if (!state.employees.length) return holder.replaceChildren(empty("Nenhum funcionário cadastrado."));
  holder.replaceChildren(...state.employees.map((item) => {
    const card = el("article", `employee-card${item.active === false ? " inactive" : ""}`);
    card.append(el("h2", "", item.displayName), el("p", "employee-role", item.jobTitle || "Função não informada"));
    const meta = el("div", "employee-card-meta");
    const pay = el("span"); pay.append("Pagamento", el("strong", "", employeePayLabel(item)));
    const status = el("span"); status.append("Situação", el("strong", "", item.paymentStatus === "paid" ? "Pago" : "Pendente"));
    const receive = el("span"); receive.append("Dia de receber", el("strong", "", item.payDay ? `Dia ${item.payDay}` : "A combinar"));
    const access = el("span"); access.append("Acesso", el("strong", "", item.active === false ? "Removido" : "Ativo"));
    meta.append(pay, status, receive, access); card.append(meta);
    const vacation = item.vacationStart || item.vacationEnd ? `Férias: ${dateLabel(item.vacationStart)} a ${dateLabel(item.vacationEnd)}` : "Férias ainda não programadas";
    card.append(el("p", "employee-vacation", vacation));
    const device = state.deviceRegistrations.get(item.id);
    card.append(el("p", `employee-device${device ? " registered" : ""}`, device ? `Aparelho cadastrado · ${dateLabel(device.enrolledAt, true)}` : "Aparelho ainda não cadastrado"));
    const actions = el("div", "employee-card-actions");
    actions.append(button("Editar", "edit-employee", item.id));
    if (isMagna() && device) actions.append(button("Trocar aparelho", "reset-device", item.id, "small-action"));
    if (isMagna()) actions.append(button(item.active === false ? "Restaurar acesso" : "Remover acesso", "toggle-employee", item.id, `small-action${item.active === false ? "" : " danger"}`));
    card.append(actions);
    return card;
  }));
}

function filteredPayments() {
  const status = $("#payment-status-filter").value;
  const search = clean($("#payment-search").value).toLocaleLowerCase("pt-BR");
  return state.payments.filter((item) => (!status || item.status === status) && (!search || `${item.title} ${item.payee} ${item.category}`.toLocaleLowerCase("pt-BR").includes(search)));
}

function googleCalendarUrl(item) {
  const day = clean(item.dueDate).replaceAll("-", "");
  const next = new Date(`${item.dueDate}T12:00:00`); next.setDate(next.getDate() + 1);
  const end = Number.isNaN(next.getTime()) ? day : next.toISOString().slice(0, 10).replaceAll("-", "");
  const params = new URLSearchParams({ action: "TEMPLATE", text: `Capannone: ${item.title}`, dates: `${day}/${end}`, details: `Valor: ${money(item.amount)}\nCategoria: ${item.category || "Conta"}\n${item.notes || ""}` });
  return `https://calendar.google.com/calendar/render?${params}`;
}

function renderPayments() {
  const holder = $("#payment-list"); const items = filteredPayments();
  if (!items.length) return holder.replaceChildren(empty("Nenhuma conta encontrada."));
  holder.replaceChildren(...items.map((item) => {
    const card = el("article", "list-card no-image"); const body = el("div");
    body.append(el("h3", "", item.title), el("p", "", `${item.category || "Conta"}${item.payee ? ` · ${item.payee}` : ""} · vence ${dateLabel(item.dueDate)} · ${money(item.amount)}`));
    const meta = el("div", "list-card-meta"); meta.append(badge(item.status === "paid" ? "Pago" : "Pendente", item.status === "paid" ? "active" : "warning"));
    if (item.recurrence && item.recurrence !== "none") meta.append(badge({ monthly: "Mensal", weekly: "Semanal", annual: "Anual" }[item.recurrence] || "Recorrente"));
    body.append(meta);
    const actions = el("div", "list-card-actions"); actions.append(button("Editar", "edit-payment", item.id), button(item.status === "paid" ? "Marcar pendente" : "Marcar paga", "toggle-payment", item.id));
    const calendar = el("a", "small-action", "Adicionar à Agenda"); calendar.href = googleCalendarUrl(item); calendar.target = "_blank"; calendar.rel = "noopener"; actions.append(calendar, button("Excluir", "delete-payment", item.id, "small-action danger"));
    card.append(body, actions); return card;
  }));
}

function filteredInventory() {
  const search = clean($("#inventory-search").value).toLocaleLowerCase("pt-BR"); const category = $("#inventory-category-filter").value; const supplier = $("#inventory-supplier-filter").value; const lowOnly = $("#inventory-low-filter").checked;
  return state.inventory.filter((item) => (!search || `${item.name} ${item.category}`.toLocaleLowerCase("pt-BR").includes(search)) && (!category || item.category === category) && (!supplier || item.supplier === supplier) && (!lowOnly || num(item.currentQuantity) <= num(item.minimumQuantity)));
}

function fillInventoryCategoryOptions() {
  const filter = $("#inventory-category-filter"); const editor = $("#inventory-category"); const filterValue = filter.value; const editorValue = editor.value;
  const existing = state.inventory.map((item) => clean(item.category, 80)).filter(Boolean);
  const categories = [...new Set([...inventoryCategories, ...existing])].sort((a, b) => a.localeCompare(b, "pt-BR"));
  filter.replaceChildren(); const all = el("option", "", "Todas as categorias"); all.value = ""; filter.append(all);
  editor.replaceChildren();
  categories.forEach((category) => { const filterOption = el("option", "", category); filterOption.value = category; filter.append(filterOption); const editorOption = el("option", "", category); editorOption.value = category; editor.append(editorOption); });
  if (categories.includes(filterValue)) filter.value = filterValue;
  editor.value = categories.includes(editorValue) ? editorValue : "Outros";
}

function updateInventorySelectionSummary() {
  const count = state.selectedInventory.size; $("#inventory-selection-count").textContent = `${count} ${count === 1 ? "produto selecionado" : "produtos selecionados"}`; $("#print-shopping-list").disabled = count === 0;
}

function renderInventory() {
  const holder = $("#inventory-list"); const items = filteredInventory(); updateInventorySelectionSummary();
  if (!items.length) return holder.replaceChildren(empty("Nenhum item de estoque encontrado."));
  holder.replaceChildren(...items.map((item) => {
    const low = num(item.currentQuantity) <= num(item.minimumQuantity); const card = el("article", "list-card inventory-card");
    const main = el("div", "inventory-card-main"); const title = el("div", "selectable-card-heading"); const selector = el("label", "item-selector"); const checkbox = el("input"); checkbox.type = "checkbox"; checkbox.className = "inventory-select"; checkbox.dataset.id = item.id; checkbox.checked = state.selectedInventory.has(item.id); checkbox.setAttribute("aria-label", `Selecionar ${item.name} para impressão`); selector.append(checkbox); title.append(selector, el("h3", "", item.name)); main.append(title, el("p", "", `${item.category || "Outros"} · ${item.supplier || "Não definido"}`));
    const tags = el("div", "inventory-tags"); tags.append(badge(`Mínimo: ${num(item.minimumQuantity)} ${item.unit || "un"}`)); if (item.buyQuantity) tags.append(badge(`Comprar: ${num(item.buyQuantity)} ${item.unit || "un"}`, "warning")); main.append(tags);
    const side = el("div"); const indicator = el("div", `stock-indicator${low ? " low" : ""}`); indicator.append(el("strong", "", String(num(item.currentQuantity))), el("span", "", `${item.unit || "un"} · ${low ? "COMPRAR" : "OK"}`));
    const actions = el("div", "inventory-actions"); actions.append(button("Editar", "edit-inventory", item.id), button("Excluir", "delete-inventory", item.id, "small-action danger")); side.append(indicator, actions); card.append(main, side); return card;
  }));
}

const recipeCategoryLabels = { recheios: "Recheios", molhos: "Molhos", massas: "Massas", pizzas: "Pizzas", bebidas: "Bebidas", doces: "Doces", preparos: "Preparos", outros: "Outros" };

function filteredRecipes() {
  const search = clean($("#recipe-search").value).toLocaleLowerCase("pt-BR"); const category = $("#recipe-category-filter").value;
  return state.recipes.filter((item) => item.active !== false && (!category || item.category === category) && (!search || `${item.name} ${item.ingredients}`.toLocaleLowerCase("pt-BR").includes(search)));
}

function renderRecipes() {
  const holder = $("#recipe-list"); const items = filteredRecipes(); updateRecipeSelectionSummary();
  if (!items.length) return holder.replaceChildren(empty("Nenhuma receita encontrada."));
  holder.replaceChildren(...items.map((item) => {
    const card = el("article", "recipe-card"); const title = el("div", "selectable-card-heading"); const selector = el("label", "item-selector"); const checkbox = el("input"); checkbox.type = "checkbox"; checkbox.className = "recipe-select"; checkbox.dataset.id = item.id; checkbox.checked = state.selectedRecipes.has(item.id); checkbox.setAttribute("aria-label", `Selecionar a receita ${item.name} para impressão`); selector.append(checkbox); const heading = el("div"); heading.append(el("span", "recipe-category", recipeCategoryLabels[item.category] || "Outros"), el("h2", "", item.name)); title.append(selector, heading); card.append(title);
    if (item.yield) card.append(el("p", "recipe-meta", item.yield));
    card.append(el("p", "recipe-preview", item.ingredients || "Ingredientes ainda não informados."));
    const actions = el("div", "recipe-actions"); actions.append(button("Editar", "edit-recipe", item.id), button("Imprimir / PDF", "print-recipe", item.id)); card.append(actions);
    const versions = state.versions.filter((version) => version.recipeId === item.id);
    const details = el("details", "recipe-history"); const summary = el("summary", "", `Versões anteriores (${versions.length})`); details.append(summary);
    const list = el("div", "version-list");
    if (!versions.length) list.append(el("div", "version-item", "Nenhuma alteração anterior."));
    else versions.forEach((version) => { const row = el("div", "version-item"); row.append(el("strong", "", version.snapshot?.name || item.name), el("span", "", `${dateLabel(version.versionedAt, true)} · por ${version.versionedByName || "usuário autorizado"}`)); list.append(row); });
    details.append(list); card.append(details); return card;
  }));
}

function updateRecipeSelectionSummary() {
  const count = state.selectedRecipes.size; $("#recipe-selection-count").textContent = `${count} ${count === 1 ? "receita selecionada" : "receitas selecionadas"}`; $("#print-selected-recipes").disabled = count === 0;
}

function fillEmployeeOptions() {
  const select = $("#shift-employee"); const selected = select.value; select.replaceChildren();
  state.employees.filter((item) => item.active !== false).forEach((item) => { const option = el("option", "", `${item.displayName} · ${item.jobTitle || "Equipe"}`); option.value = item.id; select.append(option); });
  if ([...select.options].some((option) => option.value === selected)) select.value = selected;
}

function renderShifts() {
  const holder = $("#shift-list"); const today = new Date().toISOString().slice(0, 10); const items = state.shifts.filter((item) => item.date >= today).slice(0, 40);
  if (!items.length) return holder.replaceChildren(empty("Nenhum dia de trabalho programado."));
  holder.replaceChildren(...items.map((item) => {
    const employee = state.employees.find((candidate) => candidate.id === item.employeeId); const card = el("article", "list-card no-image"); const body = el("div");
    body.append(el("h3", "", employee?.displayName || "Funcionário"), el("p", "", `${dateLabel(item.date)} · ${item.startTime || "—"} às ${item.endTime || "—"}${item.note ? ` · ${item.note}` : ""}`));
    const actions = el("div", "list-card-actions"); actions.append(button("Excluir", "delete-shift", item.id, "small-action danger")); card.append(body, actions); return card;
  }));
}

async function managerApi(path, options = {}) {
  const token = await auth.currentUser.getIdToken();
  return fetch(`${MEDIA_API}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) }, cache: "no-store", credentials: "omit" });
}

async function loadHotspotData() {
  if (!auth.currentUser || !isInternalManager()) return;
  try {
    const [entryResponse, deviceResponse] = await Promise.all([managerApi("/hotspot/entries"), managerApi("/hotspot/devices")]);
    if (!entryResponse.ok || !deviceResponse.ok) throw new Error("Integração do Hotspot ainda não configurada.");
    const [entryData, deviceData] = await Promise.all([entryResponse.json(), deviceResponse.json()]);
    state.timeEntries = Array.isArray(entryData.items) ? entryData.items : [];
    state.deviceRegistrations = new Map((Array.isArray(deviceData.items) ? deviceData.items : []).map((item) => [item.uid, item]));
    $("#hotspot-summary").textContent = entryData.configured ? "Registros confirmados pela rede Capannone e pelo aparelho cadastrado." : "O relógio de ponto será liberado após configurar a origem pública da rede Capannone.";
  } catch (error) { state.timeEntries = []; state.deviceRegistrations = new Map(); $("#hotspot-summary").textContent = friendlyError(error); }
  renderTimeEntries(); renderEmployees();
}

function renderTimeEntries() {
  const holder = $("#time-entry-list");
  if (!state.timeEntries.length) return holder.replaceChildren(el("p", "compact-empty", "Nenhum registro de ponto disponível."));
  holder.replaceChildren(...state.timeEntries.slice(0, 30).map((item) => { const row = el("div", "compact-row"); const copy = el("div"); copy.append(el("strong", "", item.displayName || item.email || "Funcionário"), el("small", "", dateLabel(item.timestamp, true))); row.append(copy, badge(item.type === "entrada" ? "Entrada" : "Saída", item.type === "entrada" ? "active" : "ended")); return row; }));
}

function renderMessages() {
  const holder = $("#chat-messages");
  if (!state.messages.length) return holder.replaceChildren(el("p", "compact-empty", "Nenhum recado enviado."));
  holder.replaceChildren(...state.messages.map((item) => { const message = el("article", `chat-message${item.senderUid === auth.currentUser?.uid ? " mine" : ""}`); message.append(el("strong", "", item.senderName || item.senderEmail || "Equipe"), el("p", "", item.text), el("time", "", dateLabel(item.createdAt, true))); return message; }));
  holder.scrollTop = holder.scrollHeight;
}

function openEmployee(item = null) {
  $("#employee-form").reset(); setMessage("#employee-message"); $("#employee-id").value = item?.id || ""; $("#employee-dialog-title").textContent = item ? "Editar funcionário" : "Cadastrar funcionário";
  $$(".new-employee-only").forEach((node) => { node.hidden = Boolean(item); }); $("#employee-email").required = !item;
  if (item) { $("#employee-name").value = item.displayName || ""; $("#employee-role").value = item.jobTitle || ""; $("#employee-pay-amount").value = item.payAmount || ""; $("#employee-pay-frequency").value = item.payFrequency || "monthly"; $("#employee-pay-day").value = item.payDay || ""; $("#employee-payment-status").value = item.paymentStatus || "pending"; $("#employee-vacation-start").value = item.vacationStart || ""; $("#employee-vacation-end").value = item.vacationEnd || ""; $("#employee-notes").value = item.notes || ""; }
  $("#employee-dialog").showModal();
}

function openPayment(item = null) {
  $("#payment-form").reset(); setMessage("#payment-message"); $("#payment-id").value = item?.id || "";
  if (item) { $("#payment-title").value = item.title || ""; $("#payment-category").value = item.category || "Fornecedor"; $("#payment-payee").value = item.payee || ""; $("#payment-amount").value = item.amount || ""; $("#payment-due-date").value = item.dueDate || ""; $("#payment-status").value = item.status || "pending"; $("#payment-recurrence").value = item.recurrence || "none"; $("#payment-notes").value = item.notes || ""; }
  $("#payment-dialog").showModal();
}

function openInventory(item = null) {
  $("#inventory-form").reset(); setMessage("#inventory-message"); $("#inventory-id").value = item?.id || ""; $("#inventory-category").value = "Outros"; $("#inventory-supplier").value = "Não definido";
  if (item) { $("#inventory-name").value = item.name || ""; $("#inventory-category").value = item.category || "Outros"; $("#inventory-supplier").value = item.supplier || "Não definido"; $("#inventory-current").value = item.currentQuantity ?? ""; $("#inventory-minimum").value = item.minimumQuantity ?? ""; $("#inventory-unit").value = item.unit || ""; $("#inventory-buy-quantity").value = item.buyQuantity ?? ""; $("#inventory-notes").value = item.notes || ""; }
  $("#inventory-dialog").showModal();
}

function recipeInput(value, column, label, size = false) { const input = el("input", `recipe-grid-input${size ? " size" : ""}`); input.type = "text"; input.value = value || ""; input.dataset.column = column; input.maxLength = column === "name" ? 300 : 200; input.setAttribute("aria-label", label); return input; }

function recipeRowsFromText(value) {
  return clean(value, 8000).split(/\r?\n/).map(ingredientParts).filter((part) => part.name).map((part) => ({ name: part.name, detail: part.detail, M: part.sizes.M, G: part.sizes.G, GG: part.sizes.GG }));
}

function readRecipeEditorRows() {
  return $$("#recipe-editor-body tr").map((row) => ({ name: clean($("[data-column=name]", row)?.value, 300), detail: clean($("[data-column=detail]", row)?.value, 700), M: clean($("[data-column=M]", row)?.value, 200), G: clean($("[data-column=G]", row)?.value, 200), GG: clean($("[data-column=GG]", row)?.value, 200) })).filter((row) => row.name || row.detail || row.M || row.G || row.GG);
}

function updateRecipeRowNumbers() { $$("#recipe-editor-body tr").forEach((row, index) => { const number = $(".recipe-row-number", row); if (number) number.textContent = String(index + 1); }); }

function addRecipeEditorRow(record = {}, focus = false) {
  const sizes = state.recipeEditorMode === "recheios"; const row = el("tr"); row.append(el("td", "recipe-row-number", String($$("#recipe-editor-body tr").length + 1)));
  const nameCell = el("td"); const nameInput = recipeInput(record.name, "name", "Ingrediente"); nameCell.append(nameInput); row.append(nameCell);
  if (sizes) ["M", "G", "GG"].forEach((column) => { const cell = el("td"); const fallback = column === "M" && !record.M && !record.G && !record.GG ? record.detail : ""; cell.append(recipeInput(record[column] || fallback, column, `Quantidade ${column}`, true)); row.append(cell); });
  else { const cell = el("td"); cell.append(recipeInput(record.detail, "detail", "Quantidade ou observação")); row.append(cell); }
  const actionCell = el("td"); const remove = el("button", "recipe-remove-row", "×"); remove.type = "button"; remove.dataset.action = "remove-recipe-row"; remove.setAttribute("aria-label", "Excluir esta linha"); actionCell.append(remove); row.append(actionCell); $("#recipe-editor-body").append(row); if (focus) nameInput.focus();
}

function renderRecipeEditor(rows = []) {
  const sizes = state.recipeEditorMode === "recheios"; const heading = el("tr"); ["#", "Ingrediente", ...(sizes ? ["Média", "Grande", "Gigante"] : ["Quantidade / observação"]), ""].forEach((label, index) => { const cell = el("th", sizes && index >= 2 && index <= 4 ? "recipe-size-column" : "", label); heading.append(cell); }); $("#recipe-editor-head").replaceChildren(heading); $("#recipe-editor-body").replaceChildren(); (rows.length ? rows : [{}]).forEach((row) => addRecipeEditorRow(row)); $("#recipe-sheet-help").textContent = sizes ? "Use uma linha por ingrediente e preencha as quantidades para Média, Grande e Gigante." : "Use uma linha por ingrediente e informe a quantidade ou observação ao lado.";
}

function serializeRecipeEditor() {
  const rows = readRecipeEditorRows().filter((row) => row.name); const sizes = state.recipeEditorMode === "recheios";
  return rows.map((row) => { if (!sizes) return row.detail ? `${row.name} — ${row.detail}` : row.name; const values = [["M", row.M], ["G", row.G], ["GG", row.GG]].filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`); return values.length ? `${row.name} — ${values.join(" | ")}` : row.name; }).join("\n");
}

function changeRecipeEditorMode() { const previous = readRecipeEditorRows(); const nextMode = $("#recipe-category").value; if (state.recipeEditorMode === "recheios" && nextMode !== "recheios") previous.forEach((row) => { row.detail = [["M", row.M], ["G", row.G], ["GG", row.GG]].filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join(" | ") || row.detail; }); if (state.recipeEditorMode !== "recheios" && nextMode === "recheios") previous.forEach((row) => { const parsed = ingredientParts(`${row.name}${row.detail ? ` — ${row.detail}` : ""}`); row.M = parsed.sizes.M || (!parsed.hasSizes ? row.detail : ""); row.G = parsed.sizes.G; row.GG = parsed.sizes.GG; }); state.recipeEditorMode = nextMode; renderRecipeEditor(previous); }

function openRecipe(item = null) {
  $("#recipe-form").reset(); setMessage("#recipe-message"); $("#recipe-id").value = item?.id || ""; $("#recipe-category").value = item?.category || "recheios"; state.recipeEditorMode = $("#recipe-category").value;
  if (item) { $("#recipe-name").value = item.name || ""; $("#recipe-yield").value = item.yield || ""; $("#recipe-instructions").value = item.instructions || ""; $("#recipe-notes").value = item.notes || ""; }
  renderRecipeEditor(recipeRowsFromText(item?.ingredients || "")); $("#recipe-dialog").showModal();
}

async function handleEmployeeSave(event) {
  event.preventDefault(); const id = $("#employee-id").value; const submit = event.submitter; submit.disabled = true; setMessage("#employee-message", "Salvando…");
  const record = { displayName: clean($("#employee-name").value, 100), jobTitle: clean($("#employee-role").value, 100), payAmount: num($("#employee-pay-amount").value), payFrequency: $("#employee-pay-frequency").value, payDay: num($("#employee-pay-day").value), paymentStatus: $("#employee-payment-status").value, vacationStart: $("#employee-vacation-start").value, vacationEnd: $("#employee-vacation-end").value, notes: clean($("#employee-notes").value, 1000), updatedAt: nowIso(), updatedBy: auth.currentUser.uid };
  try {
    if (id) { await updateDoc(doc(db, "employees", id), record); const item = state.employees.find((candidate) => candidate.id === id); Object.assign(item, record); }
    else {
      if (!isMagna()) throw new Error("Somente Magna pode cadastrar funcionários.");
      const email = clean($("#employee-email").value, 200).toLowerCase(); const provisionalPassword = $("#employee-temp-password").value;
      const credential = await createUserWithEmailAndPassword(employeeAuth, email, provisionalPassword);
      try {
        const createdAt = nowIso(); const batch = writeBatch(db);
        batch.set(doc(db, "users", credential.user.uid), { displayName: record.displayName, email, role: "employee", active: true, mustChangePassword: true, createdAt, createdBy: auth.currentUser.uid, updatedAt: createdAt, updatedBy: auth.currentUser.uid });
        batch.set(doc(db, "employees", credential.user.uid), { ...record, email, active: true, createdAt, createdBy: auth.currentUser.uid }); await batch.commit();
        state.employees.push({ id: credential.user.uid, ...record, email, active: true, createdAt }); state.employees.sort((a, b) => clean(a.displayName).localeCompare(clean(b.displayName), "pt-BR"));
      } catch (error) { await deleteUser(credential.user).catch(() => {}); throw error; }
      finally { await signOut(employeeAuth).catch(() => {}); }
    }
    $("#employee-dialog").close(); renderEmployees(); renderDashboard(); fillEmployeeOptions(); toast(id ? "Funcionário atualizado." : "Acesso criado. Entregue somente a senha provisória.");
  } catch (error) { setMessage("#employee-message", friendlyError(error), "error"); }
  finally { submit.disabled = false; }
}

async function handleEmployeeAction(control) {
  const item = state.employees.find((candidate) => candidate.id === control.dataset.id); if (!item) return;
  if (control.dataset.action === "edit-employee") return openEmployee(item);
  if (control.dataset.action === "reset-device") {
    if (!isMagna() || !confirm(`Liberar o cadastro de um novo celular para ${item.displayName}? O aparelho atual deixará de registrar ponto.`)) return;
    const response = await managerApi("/hotspot/device/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uid: item.id }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Não foi possível liberar a troca."); state.deviceRegistrations.delete(item.id); renderEmployees(); return toast("Troca liberada. O próximo celular usado na rede Capannone será cadastrado.");
  }
  if (control.dataset.action === "toggle-employee") {
    if (!isMagna()) return toast("Somente Magna pode remover ou restaurar acessos.", "error");
    const active = item.active === false; const question = active ? `Restaurar o acesso de ${item.displayName}?` : `Remover o acesso de ${item.displayName}?`;
    if (!confirm(question)) return;
    const batch = writeBatch(db); batch.update(doc(db, "users", item.id), { active, updatedAt: nowIso(), updatedBy: auth.currentUser.uid }); batch.update(doc(db, "employees", item.id), { active, updatedAt: nowIso(), updatedBy: auth.currentUser.uid }); await batch.commit(); item.active = active; renderEmployees(); renderDashboard(); fillEmployeeOptions(); toast(active ? "Acesso restaurado." : "Acesso removido imediatamente.");
  }
}

async function handlePaymentSave(event) {
  event.preventDefault(); const id = $("#payment-id").value; const submit = event.submitter; submit.disabled = true;
  const record = { title: clean($("#payment-title").value, 140), category: clean($("#payment-category").value, 80), payee: clean($("#payment-payee").value, 140), amount: num($("#payment-amount").value), dueDate: $("#payment-due-date").value, status: $("#payment-status").value, recurrence: $("#payment-recurrence").value, notes: clean($("#payment-notes").value, 1000), updatedAt: nowIso(), updatedBy: auth.currentUser.uid };
  try { if (id) { await updateDoc(doc(db, "internalPayments", id), record); Object.assign(state.payments.find((item) => item.id === id), record); } else { const created = await addDoc(collection(db, "internalPayments"), { ...record, createdAt: nowIso(), createdBy: auth.currentUser.uid }); state.payments.push({ id: created.id, ...record }); } state.payments.sort((a, b) => clean(a.dueDate).localeCompare(clean(b.dueDate))); $("#payment-dialog").close(); renderPayments(); renderDashboard(); toast("Conta salva."); }
  catch (error) { setMessage("#payment-message", friendlyError(error), "error"); } finally { submit.disabled = false; }
}

async function handlePaymentAction(control) {
  const item = state.payments.find((candidate) => candidate.id === control.dataset.id); if (!item) return;
  if (control.dataset.action === "edit-payment") return openPayment(item);
  if (control.dataset.action === "toggle-payment") { const status = item.status === "paid" ? "pending" : "paid"; await updateDoc(doc(db, "internalPayments", item.id), { status, paidAt: status === "paid" ? nowIso() : "", updatedAt: nowIso(), updatedBy: auth.currentUser.uid }); item.status = status; renderPayments(); renderDashboard(); return toast(status === "paid" ? "Conta marcada como paga." : "Conta voltou para pendente."); }
  if (control.dataset.action === "delete-payment") { if (!confirm(`Excluir a conta “${item.title}”?`)) return; await deleteDoc(doc(db, "internalPayments", item.id)); state.payments = state.payments.filter((candidate) => candidate.id !== item.id); renderPayments(); renderDashboard(); toast("Conta excluída."); }
}

async function handleInventorySave(event) {
  event.preventDefault(); const id = $("#inventory-id").value; const submit = event.submitter; submit.disabled = true;
  const record = { name: clean($("#inventory-name").value, 120), category: clean($("#inventory-category").value, 80), supplier: clean($("#inventory-supplier").value, 100) || "Não definido", currentQuantity: num($("#inventory-current").value), minimumQuantity: num($("#inventory-minimum").value), unit: clean($("#inventory-unit").value, 30) || "un", buyQuantity: num($("#inventory-buy-quantity").value), notes: clean($("#inventory-notes").value, 600), updatedAt: nowIso(), updatedBy: auth.currentUser.uid };
  try { if (id) { await updateDoc(doc(db, "inventoryItems", id), record); Object.assign(state.inventory.find((item) => item.id === id), record); } else { const created = await addDoc(collection(db, "inventoryItems"), { ...record, createdAt: nowIso(), createdBy: auth.currentUser.uid }); state.inventory.push({ id: created.id, ...record }); } state.inventory.sort((a, b) => clean(a.name).localeCompare(clean(b.name), "pt-BR")); $("#inventory-dialog").close(); fillInventoryCategoryOptions(); renderInventory(); renderDashboard(); toast("Estoque atualizado."); }
  catch (error) { setMessage("#inventory-message", friendlyError(error), "error"); } finally { submit.disabled = false; }
}

async function handleInventoryAction(control) {
  const item = state.inventory.find((candidate) => candidate.id === control.dataset.id); if (!item) return;
  if (control.dataset.action === "edit-inventory") return openInventory(item);
  if (control.dataset.action === "delete-inventory") { if (!confirm(`Excluir “${item.name}” do estoque?`)) return; await deleteDoc(doc(db, "inventoryItems", item.id)); state.inventory = state.inventory.filter((candidate) => candidate.id !== item.id); state.selectedInventory.delete(item.id); fillInventoryCategoryOptions(); renderInventory(); renderDashboard(); toast("Item excluído."); }
}

async function handleRecipeSave(event) {
  event.preventDefault(); const id = $("#recipe-id").value; const submit = event.submitter; const ingredients = clean(serializeRecipeEditor(), 8000); if (!ingredients) return setMessage("#recipe-message", "Inclua pelo menos um ingrediente na planilha.", "error"); $("#recipe-ingredients").value = ingredients; submit.disabled = true;
  const record = { name: clean($("#recipe-name").value, 140), category: $("#recipe-category").value, yield: clean($("#recipe-yield").value, 200), ingredients, instructions: clean($("#recipe-instructions").value, 10000), notes: clean($("#recipe-notes").value, 3000), active: true, updatedAt: nowIso(), updatedBy: auth.currentUser.uid };
  try {
    if (id) { const current = state.recipes.find((item) => item.id === id); const versionRef = doc(collection(db, "recipeVersions")); const version = { recipeId: id, snapshot: { name: current.name || "", category: current.category || "outros", yield: current.yield || "", ingredients: current.ingredients || "", instructions: current.instructions || "", notes: current.notes || "" }, versionedAt: nowIso(), versionedBy: auth.currentUser.uid, versionedByName: state.profile.displayName || auth.currentUser.email }; const batch = writeBatch(db); batch.set(versionRef, version); batch.update(doc(db, "recipes", id), record); await batch.commit(); state.versions.unshift({ id: versionRef.id, ...version }); Object.assign(current, record); }
    else { const created = await addDoc(collection(db, "recipes"), { ...record, createdAt: nowIso(), createdBy: auth.currentUser.uid }); state.recipes.push({ id: created.id, ...record }); }
    state.recipes.sort((a, b) => clean(a.name).localeCompare(clean(b.name), "pt-BR")); $("#recipe-dialog").close(); renderRecipes(); renderDashboard(); toast(id ? "Receita atualizada e versão anterior guardada." : "Receita criada.");
  } catch (error) { setMessage("#recipe-message", friendlyError(error), "error"); } finally { submit.disabled = false; }
}

function ingredientParts(line) {
  const chunks = clean(line, 1000).split(/\s+[—–]\s+|\s+-\s+/); const name = clean(chunks.shift(), 300); const detail = clean(chunks.join(" — "), 700); const sizes = { M: "", G: "", GG: "" };
  detail.split("|").forEach((part) => { const match = clean(part).match(/^(GG|G|M)\s*:\s*(.+)$/i); if (match) sizes[match[1].toUpperCase()] = clean(match[2], 200); });
  return { name: name || clean(line, 1000), detail, sizes, hasSizes: Boolean(sizes.M || sizes.G || sizes.GG) };
}

function buildIngredientTable(item, compact = false) {
  const rows = clean(item.ingredients, 8000).split(/\r?\n/).map(ingredientParts).filter((part) => part.name); const hasSizes = rows.some((part) => part.hasSizes); const table = el("table", `recipe-print-table${compact ? " compact" : ""}`); const thead = el("thead"); const heading = el("tr");
  (hasSizes ? ["Ingrediente", "M", "G", "GG"] : ["Ingrediente", "Quantidade / observação"]).forEach((label) => heading.append(el("th", "", label))); thead.append(heading); table.append(thead); const tbody = el("tbody");
  if (!rows.length) { const row = el("tr"); const cell = el("td", "", "Ingredientes ainda não informados."); cell.colSpan = hasSizes ? 4 : 2; row.append(cell); tbody.append(row); }
  rows.forEach((part) => { const row = el("tr"); const values = hasSizes ? [part.name, part.sizes.M || (!part.hasSizes ? part.detail : ""), part.sizes.G, part.sizes.GG] : [part.name, part.detail]; values.forEach((value) => row.append(el("td", "", value || "—"))); tbody.append(row); });
  table.append(tbody); return table;
}

function appendRecipeDetails(container, item, compact = false) {
  if (item.instructions) { container.append(el("h3", "print-section-title", "Modo de preparo"), el("p", `print-pre-line${compact ? " compact" : ""}`, item.instructions)); }
  if (item.notes) { container.append(el("h3", "print-section-title", "Observações"), el("p", `print-pre-line${compact ? " compact" : ""}`, item.notes)); }
}

function fillingNote(item) {
  const recipeName = clean(item.name, 160).toLocaleLowerCase("pt-BR");
  return [item.instructions, item.notes].filter(Boolean).flatMap((value) => clean(value, 10000).split(/\r?\n/)).map((line) => clean(line, 1000)).filter((line) => line && line.toLocaleLowerCase("pt-BR") !== recipeName).join("\n");
}

function fillingEstimatedHeight(item) {
  const ingredientCount = clean(item.ingredients, 8000).split(/\r?\n/).map(ingredientParts).filter((part) => part.name).length; const note = fillingNote(item); const noteLines = note ? note.split(/\r?\n/).reduce((total, line) => total + Math.max(1, Math.ceil(line.length / 75)), 0) : 0;
  return 17.5 + ingredientCount * 6.7 + noteLines * 6.7;
}

function buildFillingTable(item) {
  const rows = clean(item.ingredients, 8000).split(/\r?\n/).map(ingredientParts).filter((part) => part.name); const table = el("table", "recipe-print-table compact filling-recipe-table"); const thead = el("thead"); const heading = el("tr");
  ["Ingrediente", "Média", "Grande", "Gigante"].forEach((label) => heading.append(el("th", "", label))); thead.append(heading); table.append(thead); const tbody = el("tbody");
  rows.forEach((part) => { const fallback = part.detail || "—"; const values = [part.name, part.hasSizes ? part.sizes.M || "—" : fallback, part.hasSizes ? part.sizes.G || "—" : fallback, part.hasSizes ? part.sizes.GG || "—" : fallback]; const row = el("tr"); values.forEach((value) => row.append(el("td", "", value))); tbody.append(row); });
  const note = fillingNote(item); if (note) { const row = el("tr", "filling-note-row"); const cell = el("td", "", note); cell.colSpan = 4; row.append(cell); tbody.append(row); }
  table.append(tbody); return table;
}

function buildRecipeSheet(item) {
  const sheet = el("article", "print-sheet print-recipe-page"); sheet.append(el("p", "print-kicker", `Receitas Capannone · ${recipeCategoryLabels[item.category] || "Outros"}`), el("h1", "", item.name)); if (item.yield) sheet.append(el("p", "print-meta", item.yield)); sheet.append(el("h2", "", "Ingredientes"), buildIngredientTable(item)); appendRecipeDetails(sheet, item); sheet.append(el("p", "print-footer", `Versão atualizada em ${dateLabel(item.updatedAt, true)} · Uso interno Capannone`)); return sheet;
}

function buildFillingPage(items) {
  const sheet = el("article", "print-sheet filling-print-page"); const grid = el("div", "filling-print-grid");
  items.forEach((item) => { const card = el("section", "filling-print-card"); card.append(el("h2", "", item.name), buildFillingTable(item)); grid.append(card); });
  sheet.append(grid); return sheet;
}

function startPrint(nodes, mode = "") {
  const area = $("#print-area"); area.replaceChildren(...nodes); area.setAttribute("aria-hidden", "false"); document.body.classList.add("printing"); if (mode) document.body.classList.add(mode); window.print();
}

function printRecipes(items) {
  if (!items.length) return toast("Selecione pelo menos uma receita para imprimir.", "error"); const fillings = items.filter((item) => item.category === "recheios"); const others = items.filter((item) => item.category !== "recheios"); const sheets = []; const fillingPages = []; let currentPage = []; let usedHeight = 0;
  fillings.forEach((item) => { const height = fillingEstimatedHeight(item); const gap = currentPage.length ? 2 : 0; if (currentPage.length && usedHeight + gap + height > 280) { fillingPages.push(currentPage); currentPage = []; usedHeight = 0; } currentPage.push(item); usedHeight += (currentPage.length > 1 ? 2 : 0) + height; }); if (currentPage.length) fillingPages.push(currentPage);
  fillingPages.forEach((page) => sheets.push(buildFillingPage(page)));
  others.forEach((item) => sheets.push(buildRecipeSheet(item))); startPrint(sheets, fillings.length ? "printing-recipes" : "");
}

function printRecipe(item) {
  printRecipes([item]);
}

function printSelectedRecipes() {
  const items = state.recipes.filter((item) => state.selectedRecipes.has(item.id) && item.active !== false); printRecipes(items);
}

function printShoppingList() {
  const items = state.inventory.filter((item) => state.selectedInventory.has(item.id)).sort((a, b) => clean(a.category).localeCompare(clean(b.category), "pt-BR") || clean(a.name).localeCompare(clean(b.name), "pt-BR"));
  if (!items.length) return toast("Selecione pelo menos um produto para imprimir.", "error");
  const sheet = el("article", "print-sheet print-shopping"); sheet.append(el("p", "print-kicker", "Estoque Capannone"), el("h1", "", "Lista de compras"), el("p", "print-meta", `Gerada em ${dateLabel(nowIso(), true)} · ${items.length} ${items.length === 1 ? "produto" : "produtos"}`)); const table = el("table"); const head = el("tr"); ["OK", "Produto", "Categoria", "Fornecedor", "Estoque atual", "Comprar", "Observações"].forEach((label) => head.append(el("th", "", label))); const thead = el("thead"); thead.append(head); table.append(thead); const body = el("tbody");
  items.forEach((item) => { const row = el("tr"); const unit = item.unit || "un"; const values = ["", item.name, item.category || "Outros", item.supplier || "Não definido", `${num(item.currentQuantity)} ${unit}`, num(item.buyQuantity) ? `${num(item.buyQuantity)} ${unit}` : "—", item.notes || ""]; values.forEach((value, index) => { const cell = el("td", index === 0 ? "print-check-cell" : "", value); row.append(cell); }); body.append(row); }); table.append(body); sheet.append(table, el("p", "print-footer", "Lista organizacional interna · conferir quantidades antes da compra")); startPrint([sheet], "printing-shopping");
}

async function handleRecipeAction(control) {
  const item = state.recipes.find((candidate) => candidate.id === control.dataset.id); if (!item) return;
  if (control.dataset.action === "edit-recipe") openRecipe(item);
  if (control.dataset.action === "print-recipe") printRecipe(item);
}

async function handleShiftSave(event) {
  event.preventDefault(); const submit = event.submitter; submit.disabled = true; const record = { employeeId: $("#shift-employee").value, date: $("#shift-date").value, startTime: $("#shift-start").value, endTime: $("#shift-end").value, note: clean($("#shift-note").value, 240), createdAt: nowIso(), createdBy: auth.currentUser.uid, updatedAt: nowIso(), updatedBy: auth.currentUser.uid };
  try { if (!record.employeeId) throw new Error("Cadastre um funcionário antes de criar a escala."); const created = await addDoc(collection(db, "workShifts"), record); state.shifts.push({ id: created.id, ...record }); state.shifts.sort((a, b) => clean(a.date).localeCompare(clean(b.date))); event.target.reset(); renderShifts(); toast("Dia de trabalho adicionado."); }
  catch (error) { setMessage("#shift-message", friendlyError(error), "error"); } finally { submit.disabled = false; }
}

async function handleShiftAction(control) {
  const item = state.shifts.find((candidate) => candidate.id === control.dataset.id); if (!item || control.dataset.action !== "delete-shift") return; if (!confirm("Excluir este dia da escala?")) return; await deleteDoc(doc(db, "workShifts", item.id)); state.shifts = state.shifts.filter((candidate) => candidate.id !== item.id); renderShifts(); toast("Dia removido da escala.");
}

async function handleChatSave(event) {
  event.preventDefault(); const text = clean($("#chat-text").value, 1000); if (!text) return; const submit = event.submitter; submit.disabled = true;
  try { const record = { text, senderUid: auth.currentUser.uid, senderEmail: auth.currentUser.email || "", senderName: state.profile.displayName || "Magna", senderRole: state.profile.role, createdAt: nowIso() }; const created = await addDoc(collection(db, "staffMessages"), record); state.messages.push({ id: created.id, ...record }); event.target.reset(); renderMessages(); }
  catch (error) { toast(friendlyError(error), "error"); } finally { submit.disabled = false; }
}

function enableTemporaryPasswordReveal() {
  $$('input[type="password"]').forEach((input) => {
    if (input.closest(".password-control")) return; const control = el("div", "password-control"); input.parentNode.insertBefore(control, input); control.append(input); const revealButton = el("button", "password-reveal"); revealButton.type = "button"; revealButton.setAttribute("aria-label", "Manter pressionado para visualizar a senha"); revealButton.setAttribute("aria-controls", input.id); revealButton.setAttribute("aria-pressed", "false"); revealButton.title = "Mantenha pressionado para visualizar a senha"; revealButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2.5 12s3.4-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.4 5.5-9.5 5.5S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.7"/><path class="password-reveal-slash" d="M4 4l16 16"/></svg>';
    const reveal = () => { input.type = "text"; revealButton.classList.add("is-revealing"); revealButton.setAttribute("aria-pressed", "true"); }; const conceal = () => { input.type = "password"; revealButton.classList.remove("is-revealing"); revealButton.setAttribute("aria-pressed", "false"); };
    revealButton.addEventListener("pointerdown", (event) => { event.preventDefault(); revealButton.setPointerCapture?.(event.pointerId); reveal(); }); ["pointerup", "pointercancel", "pointerleave", "lostpointercapture"].forEach((eventName) => revealButton.addEventListener(eventName, conceal)); revealButton.addEventListener("keydown", (event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); reveal(); } }); revealButton.addEventListener("keyup", conceal); revealButton.addEventListener("click", (event) => { event.preventDefault(); conceal(); }); revealButton.addEventListener("blur", conceal); window.addEventListener("blur", conceal); control.append(revealButton);
  });
}

function wireUi() {
  enableTemporaryPasswordReveal();
  $("#login-form").addEventListener("submit", async (event) => { event.preventDefault(); const submit = event.submitter; submit.disabled = true; setMessage("#login-message", "Entrando…"); try { await signInWithEmailAndPassword(auth, clean($("#login-email").value, 200).toLowerCase(), $("#login-password").value); event.target.reset(); } catch (error) { setMessage("#login-message", friendlyError(error), "error"); } finally { submit.disabled = false; } });
  $("#password-form").addEventListener("submit", async (event) => { event.preventDefault(); const password = $("#new-password").value; if (password !== $("#confirm-password").value) return setMessage("#password-message", "As senhas não coincidem.", "error"); if (!/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) return setMessage("#password-message", "Use letras e números na nova senha.", "error"); const submit = event.submitter; submit.disabled = true; try { await updatePassword(auth.currentUser, password); await updateDoc(doc(db, "users", auth.currentUser.uid), { mustChangePassword: false, passwordChangedAt: nowIso(), updatedAt: nowIso() }); state.profile.mustChangePassword = false; event.target.reset(); showAuthView("app"); await loadAllData(); switchView("dashboard"); } catch (error) { setMessage("#password-message", friendlyError(error), "error"); } finally { submit.disabled = false; } });
  $("#logout-button").addEventListener("click", () => signOut(auth)); $("#refresh-dashboard").addEventListener("click", async () => { await loadAllData(); toast("Dados atualizados."); });
  $("#authorize-hotspot-network").addEventListener("click", async (event) => { if (!isMagna() || !confirm("Você está conectada ao Wi‑Fi da Capannone? Esta conexão passará a liberar o relógio de ponto.")) return; const control = event.currentTarget; control.disabled = true; try { const response = await managerApi("/hotspot/network/authorize", { method: "POST" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Não foi possível reconhecer esta rede."); $("#hotspot-summary").textContent = "Rede Capannone reconhecida. O ponto será liberado automaticamente neste local."; toast("Rede Capannone reconhecida com segurança."); } catch (error) { toast(friendlyError(error), "error"); } finally { control.disabled = false; } });
  $$('[data-internal-view], [data-go-view]').forEach((control) => control.addEventListener("click", () => switchView(control.dataset.internalView || control.dataset.goView)));
  $("#new-employee-button").addEventListener("click", () => openEmployee()); $("#new-payment-button").addEventListener("click", () => openPayment()); $("#new-inventory-button").addEventListener("click", () => openInventory()); $("#new-recipe-button").addEventListener("click", () => openRecipe());
  $("#add-recipe-row").addEventListener("click", () => addRecipeEditorRow({}, true)); $("#recipe-category").addEventListener("change", changeRecipeEditorMode); $("#recipe-editor-body").addEventListener("click", (event) => { const control = event.target.closest('[data-action="remove-recipe-row"]'); if (!control) return; const rows = $$("#recipe-editor-body tr"); if (rows.length === 1) return renderRecipeEditor([]); control.closest("tr").remove(); updateRecipeRowNumbers(); });
  $("#employee-form").addEventListener("submit", handleEmployeeSave); $("#payment-form").addEventListener("submit", handlePaymentSave); $("#inventory-form").addEventListener("submit", handleInventorySave); $("#recipe-form").addEventListener("submit", handleRecipeSave); $("#shift-form").addEventListener("submit", handleShiftSave); $("#chat-form").addEventListener("submit", handleChatSave);
  $("#employee-list").addEventListener("click", (event) => { const control = event.target.closest("button[data-action]"); if (control) handleEmployeeAction(control).catch((error) => toast(friendlyError(error), "error")); }); $("#payment-list").addEventListener("click", (event) => { const control = event.target.closest("button[data-action]"); if (control) handlePaymentAction(control).catch((error) => toast(friendlyError(error), "error")); }); $("#inventory-list").addEventListener("click", (event) => { const control = event.target.closest("button[data-action]"); if (control) handleInventoryAction(control).catch((error) => toast(friendlyError(error), "error")); }); $("#recipe-list").addEventListener("click", (event) => { const control = event.target.closest("button[data-action]"); if (control) handleRecipeAction(control).catch((error) => toast(friendlyError(error), "error")); }); $("#shift-list").addEventListener("click", (event) => { const control = event.target.closest("button[data-action]"); if (control) handleShiftAction(control).catch((error) => toast(friendlyError(error), "error")); });
  $("#inventory-list").addEventListener("change", (event) => { const checkbox = event.target.closest(".inventory-select"); if (!checkbox) return; if (checkbox.checked) state.selectedInventory.add(checkbox.dataset.id); else state.selectedInventory.delete(checkbox.dataset.id); updateInventorySelectionSummary(); });
  $("#recipe-list").addEventListener("change", (event) => { const checkbox = event.target.closest(".recipe-select"); if (!checkbox) return; if (checkbox.checked) state.selectedRecipes.add(checkbox.dataset.id); else state.selectedRecipes.delete(checkbox.dataset.id); updateRecipeSelectionSummary(); });
  ["#payment-status-filter", "#payment-search"].forEach((selector) => $(selector).addEventListener(selector.includes("status") ? "change" : "input", renderPayments)); ["#inventory-search", "#inventory-category-filter", "#inventory-supplier-filter", "#inventory-low-filter"].forEach((selector) => $(selector).addEventListener(selector.includes("search") ? "input" : "change", renderInventory)); ["#recipe-search", "#recipe-category-filter"].forEach((selector) => $(selector).addEventListener(selector.includes("search") ? "input" : "change", renderRecipes));
  $("#select-visible-inventory").addEventListener("click", () => { filteredInventory().forEach((item) => state.selectedInventory.add(item.id)); renderInventory(); }); $("#clear-inventory-selection").addEventListener("click", () => { state.selectedInventory.clear(); renderInventory(); });
  $("#select-visible-recipes").addEventListener("click", () => { filteredRecipes().forEach((item) => state.selectedRecipes.add(item.id)); renderRecipes(); }); $("#clear-recipe-selection").addEventListener("click", () => { state.selectedRecipes.clear(); renderRecipes(); });
  $("#print-shopping-list").addEventListener("click", printShoppingList); $("#print-selected-recipes").addEventListener("click", printSelectedRecipes); $$("[data-close-dialog]").forEach((control) => control.addEventListener("click", () => $(`#${control.dataset.closeDialog}`).close())); window.addEventListener("afterprint", () => { document.body.classList.remove("printing", "printing-recipes", "printing-shopping"); $("#print-area").setAttribute("aria-hidden", "true"); $("#print-area").replaceChildren(); });
}

wireUi();
setPersistence(auth, browserSessionPersistence).catch(() => {}); setPersistence(employeeAuth, inMemoryPersistence).catch(() => {});
onAuthStateChanged(auth, async (user) => {
  setMessage("#login-message");
  if (!user) { state.profile = null; showAuthView("login"); return; }
  try {
    const profileDoc = await getDoc(doc(db, "users", user.uid)); if (!profileDoc.exists()) throw new Error("Este usuário não foi autorizado."); state.profile = { id: profileDoc.id, ...profileDoc.data() };
    if (state.profile.role === "employee") { location.replace("/funcionarios"); return; }
    if (state.profile.role === "admin" && clean(state.profile.email).toLowerCase() !== MAGNA_EMAIL) { location.replace("/marketing"); return; }
    if (!isMagna() && !isSuperadmin()) throw new Error("Este perfil não tem acesso à gestão interna.");
    if (!state.profile.active) throw new Error("Este acesso está bloqueado.");
    $("#user-summary").textContent = `${state.profile.displayName || user.email} · ${isSuperadmin() ? "Super-administrador" : "Proprietária"}`; $("#welcome-name").textContent = clean(state.profile.displayName || "Magna", 80).split(" ")[0]; applyRoleVisibility();
    if (state.profile.mustChangePassword) { showAuthView("password"); return; }
    showAuthView("app"); await loadAllData(); switchView(new URL(location.href).searchParams.get("view") || "dashboard");
  } catch (error) { await signOut(auth).catch(() => {}); showAuthView("login"); setMessage("#login-message", friendlyError(error), "error"); }
});
