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

function formatDateHeader(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function slotCard(video) {
  const el = document.createElement("div");
  el.className = "slot-card";
  el.draggable = true;
  el.innerHTML = `
    <video src="${video.video_url}" muted preload="metadata"></video>
    <div class="slot-card-body">
      <div class="slot-card-id">#${video.id}</div>
      <div class="slot-card-title">${escapeHtml(video.title)}</div>
      <div class="slot-card-actions">
        <button data-action="unqueue" title="Return to review">↩</button>
        <button data-action="reject" title="Remove">✕</button>
      </div>
    </div>
  `;
  el.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", String(video.id));
    e.dataTransfer.effectAllowed = "move";
  });
  el.querySelector('[data-action="unqueue"]').addEventListener("click", async (e) => {
    e.stopPropagation();
    await api(`/api/videos/${video.id}/return-to-review`, { method: "POST" });
    loadAll();
  });
  el.querySelector('[data-action="reject"]').addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!confirm(`Remove "${video.title}" from the schedule and delete the file?`)) return;
    await api(`/api/videos/${video.id}/reject`, { method: "POST" });
    loadAll();
  });
  return el;
}

function scheduleCell(datetime) {
  const td = document.createElement("td");
  td.className = "schedule-cell";
  td.addEventListener("dragover", (e) => {
    e.preventDefault();
    td.classList.add("drag-over");
  });
  td.addEventListener("dragleave", () => td.classList.remove("drag-over"));
  td.addEventListener("drop", async (e) => {
    e.preventDefault();
    td.classList.remove("drag-over");
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    await api(`/api/videos/${id}/schedule`, {
      method: "POST",
      body: JSON.stringify({ scheduled_time: datetime }),
    });
    loadAll();
  });
  return td;
}

async function renderSchedule() {
  const container = document.getElementById("scheduleTable");
  const grid = await api("/api/schedule?days=14");

  const table = document.createElement("table");
  table.className = "schedule-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.innerHTML = "<th></th>" + grid.map((day) => `<th>${formatDateHeader(day.date)}</th>`).join("");
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const slots = grid[0]?.slots.map((s) => s.slot) ?? [];
  slots.forEach((slot, slotIndex) => {
    const tr = document.createElement("tr");
    const labelTd = document.createElement("td");
    labelTd.className = "slot-label";
    labelTd.textContent = slot;
    tr.appendChild(labelTd);

    grid.forEach((day) => {
      const { datetime, video } = day.slots[slotIndex];
      const td = scheduleCell(datetime);
      if (video) {
        td.appendChild(slotCard(video));
      } else {
        const empty = document.createElement("div");
        empty.className = "slot-empty";
        empty.textContent = "—";
        td.appendChild(empty);
      }
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  container.innerHTML = "";
  container.appendChild(table);
}

async function loadAll() {
  const pendingList = document.getElementById("pendingList");

  const pending = await api("/api/videos/pending");

  pendingList.innerHTML = "";
  if (pending.length === 0) {
    pendingList.innerHTML = '<div class="empty">No videos waiting for review.</div>';
  } else {
    pending.forEach((v) => pendingList.appendChild(pendingCard(v)));
  }

  await renderSchedule();
}

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  window.location.href = "/login";
});

loadAll();
