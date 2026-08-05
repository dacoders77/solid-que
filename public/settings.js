async function api(path, options) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("unauthorized");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `request failed: ${res.status}`);
  }
  return res.json();
}

function networkRow(network) {
  const el = document.createElement("label");
  el.className = "network-row";
  el.innerHTML = `
    <input type="checkbox" ${network.enabled ? "checked" : ""} />
    <span class="network-label">${network.label}</span>
    <a href="${network.profile_url}" target="_blank" rel="noopener" class="network-profile-link">View profile ↗</a>
  `;
  const checkbox = el.querySelector('input[type="checkbox"]');
  checkbox.addEventListener("change", async () => {
    try {
      await api(`/api/settings/networks/${network.network}/toggle`, {
        method: "POST",
        body: JSON.stringify({ enabled: checkbox.checked }),
      });
      showToast(`${network.label} ${checkbox.checked ? "enabled" : "disabled"}.`, "success");
    } catch (err) {
      checkbox.checked = !checkbox.checked;
      showToast(`Couldn't update ${network.label}: ${err.message}`, "error");
    }
  });
  return el;
}

async function loadSettings() {
  const list = document.getElementById("networkList");
  const networks = await api("/api/settings/networks");
  list.innerHTML = "";
  networks.forEach((n) => list.appendChild(networkRow(n)));
}

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  window.location.href = "/login";
});

loadSettings();
