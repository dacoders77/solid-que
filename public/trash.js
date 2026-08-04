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

function escapeHtml(str) {
  return (str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function trashCard(video) {
  const el = document.createElement("div");
  el.className = "card";
  el.innerHTML = `
    <video src="${video.video_url}" controls preload="metadata"></video>
    <div class="card-body">
      <div class="card-id">#${video.id}</div>
      <div class="card-title">${escapeHtml(video.title)}</div>
      <div class="card-desc">${escapeHtml(video.description)}</div>
      <div class="card-actions">
        <button data-action="restore" title="Return to queue">↩ Return to Queue</button>
        <button data-action="delete-forever" title="Delete forever">🗑 Delete Forever</button>
      </div>
    </div>
  `;
  el.querySelector('[data-action="restore"]').addEventListener("click", async () => {
    try {
      await api(`/api/videos/${video.id}/return-to-review`, { method: "POST" });
      loadTrash();
    } catch (err) {
      alert(`Restore failed: ${err.message}`);
    }
  });
  el.querySelector('[data-action="delete-forever"]').addEventListener("click", async () => {
    if (!confirm(`Permanently delete "${video.title}"? This cannot be undone.`)) return;
    try {
      await api(`/api/videos/${video.id}/delete-forever`, { method: "POST" });
      loadTrash();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  });
  return el;
}

async function loadTrash() {
  const trashList = document.getElementById("trashList");
  const trash = await api("/api/videos/trash");

  trashList.innerHTML = "";
  if (trash.length === 0) {
    trashList.innerHTML = '<div class="empty">Trash is empty.</div>';
  } else {
    trash.forEach((v) => trashList.appendChild(trashCard(v)));
  }
}

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  window.location.href = "/login";
});

loadTrash();
