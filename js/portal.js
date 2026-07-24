document.addEventListener("DOMContentLoaded", () => {
const terms = document.querySelector("#terms");
const button = document.querySelector("#release-btn");
const message = document.querySelector("#portal-message");
button.addEventListener("click", () => {
if (!terms.checked) {
message.textContent = "Marque o aceite dos termos para continuar.";
message.dataset.state = "error";
return;
}
message.textContent = "Acesso liberado. Abrindo o cardápio…";
message.dataset.state = "success";
setTimeout(() => { window.location.href = "https://aiqfome.com/MG/itabirito/capannone"; }, 500);
});
});