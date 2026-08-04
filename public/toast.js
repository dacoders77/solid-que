function showToast(message, type = "info", persist = false) {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message + (persist ? " (click to dismiss)" : "");
  toast.addEventListener("click", () => toast.remove());
  container.appendChild(toast);
  if (!persist) {
    setTimeout(() => toast.remove(), 6000);
  }
}
