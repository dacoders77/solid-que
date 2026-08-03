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

function pendingCard(video) {
  const el = document.createElement("div");
  el.className = "card";
  el.innerHTML = `
    <video src="${video.video_url}" controls preload="metadata"></video>
    <div class="card-body">
      <span class="status-badge">${video.status}</span>
      <div class="card-id">#${video.id}</div>
      <div class="card-title">${escapeHtml(video.title)}</div>
      <div class="card-desc">${escapeHtml(video.description)}</div>
      <div class="card-actions">
        <button class="primary" data-action="approve">Approve</button>
        <button data-action="reject">Delete</button>
      </div>
    </div>
  `;
  el.querySelector('[data-action="approve"]').addEventListener("click", async () => {
    await api(`/api/videos/${video.id}/approve`, { method: "POST" });
    loadAll();
  });
  el.querySelector('[data-action="reject"]').addEventListener("click", async () => {
    if (!confirm(`Delete "${video.title}"? This removes the file permanently.`)) return;
    await api(`/api/videos/${video.id}/reject`, { method: "POST" });
    loadAll();
  });
  return el;
}

function queueCard(video, index, total) {
  const el = document.createElement("div");
  el.className = "card";
  const linkRow = ["youtube_link", "instagram_link", "facebook_link", "tiktok_link"]
    .filter((k) => video[k])
    .map((k) => `<a href="${video[k]}" target="_blank">${k.replace("_link", "")}</a>`)
    .join("");

  el.innerHTML = `
    <video src="${video.video_url}" controls preload="metadata"></video>
    <div class="card-body">
      <span class="status-badge">${video.status}</span>
      <div class="card-id">#${video.id}</div>
      <div class="card-title">${escapeHtml(video.title)}</div>
      <div class="card-desc">${escapeHtml(video.description)}</div>
      ${linkRow ? `<div class="links">${linkRow}</div>` : ""}
      <div class="card-actions">
        <button data-action="up" ${index === 0 ? "disabled" : ""}>▲ Up</button>
        <button data-action="down" ${index === total - 1 ? "disabled" : ""}>▼ Down</button>
        <button data-action="postpone">Postpone</button>
        <button data-action="unqueue">Return to review</button>
        <button data-action="reject">Remove</button>
      </div>
    </div>
  `;
  el.querySelector('[data-action="unqueue"]').addEventListener("click", async () => {
    await api(`/api/videos/${video.id}/return-to-review`, { method: "POST" });
    loadAll();
  });
  el.querySelector('[data-action="up"]').addEventListener("click", async () => {
    await api(`/api/videos/${video.id}/move`, { method: "POST", body: JSON.stringify({ direction: "up" }) });
    loadAll();
  });
  el.querySelector('[data-action="down"]').addEventListener("click", async () => {
    await api(`/api/videos/${video.id}/move`, { method: "POST", body: JSON.stringify({ direction: "down" }) });
    loadAll();
  });
  el.querySelector('[data-action="postpone"]').addEventListener("click", async () => {
    const hours = prompt("Postpone for how many hours?", "24");
    if (!hours) return;
    const until = new Date(Date.now() + Number(hours) * 3600 * 1000).toISOString();
    await api(`/api/videos/${video.id}/postpone`, { method: "POST", body: JSON.stringify({ until }) });
    loadAll();
  });
  el.querySelector('[data-action="reject"]').addEventListener("click", async () => {
    if (!confirm(`Remove "${video.title}" from the queue and delete the file?`)) return;
    await api(`/api/videos/${video.id}/reject`, { method: "POST" });
    loadAll();
  });
  return el;
}

async function loadAll() {
  const pendingList = document.getElementById("pendingList");
  const queueList = document.getElementById("queueList");

  const [pending, queue] = await Promise.all([
    api("/api/videos/pending"),
    api("/api/queue"),
  ]);

  pendingList.innerHTML = "";
  if (pending.length === 0) {
    pendingList.innerHTML = '<div class="empty">No videos waiting for review.</div>';
  } else {
    pending.forEach((v) => pendingList.appendChild(pendingCard(v)));
  }

  queueList.innerHTML = "";
  if (queue.length === 0) {
    queueList.innerHTML = '<div class="empty">Queue is empty.</div>';
  } else {
    queue.forEach((v, i) => queueList.appendChild(queueCard(v, i, queue.length)));
  }
}

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  window.location.href = "/login";
});

loadAll();
