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

function fadeOutAndReload(el) {
  el.classList.add("fading-out");
  setTimeout(() => loadAll(), 280);
}

function folderOf(fullPath) {
  const parts = fullPath.split(/[\\/]/);
  parts.pop();
  return parts.join("\\");
}

function pendingCard(video) {
  const el = document.createElement("div");
  el.className = "card";
  const folderPath = folderOf(video.video_path);
  el.innerHTML = `
    <video src="${video.video_url}" controls preload="metadata"></video>
    <div class="card-body">
      <div class="card-meta-row">
        <span class="status-badge">${video.status}</span>
      </div>
      <div class="note-icons">
        <button class="icon-btn" data-action="note-up" title="Like (note only, no action)">👍</button>
        <button class="icon-btn" data-action="note-down" title="Dislike (note only, no action)">👎</button>
        <button class="icon-btn" data-action="open-folder" title="${escapeHtml(folderPath)}">📁</button>
      </div>
      <div class="card-id">#${video.id}</div>
      <div class="card-title">${escapeHtml(video.title)}</div>
      <div class="card-desc">${escapeHtml(video.description)}</div>
      <div class="card-actions">
        <button class="primary" data-action="approve">Approve</button>
        <button data-action="reject">Reject</button>
      </div>
    </div>
  `;
  el.querySelector('[data-action="approve"]').addEventListener("click", async () => {
    try {
      await api(`/api/videos/${video.id}/approve`, { method: "POST" });
      fadeOutAndReload(el);
    } catch (err) {
      showToast(`Approve failed: ${err.message}`, "error");
    }
  });
  el.querySelector('[data-action="reject"]').addEventListener("click", async () => {
    try {
      await api(`/api/videos/${video.id}/reject`, { method: "POST" });
      fadeOutAndReload(el);
    } catch (err) {
      showToast(`Reject failed: ${err.message}`, "error");
    }
  });
  el.querySelector('[data-action="open-folder"]').addEventListener("click", async () => {
    try {
      await api(`/api/videos/${video.id}/open-folder`, { method: "POST" });
    } catch (err) {
      showToast(`Couldn't open folder: ${err.message}`, "error");
    }
  });
  // Note buttons are purely visual — no API call, nothing persisted.
  el.querySelector('[data-action="note-down"]').addEventListener("click", () => {
    el.classList.add("noted-down");
  });
  el.querySelector('[data-action="note-up"]').addEventListener("click", () => {
    el.classList.remove("noted-down");
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
  const metricoolBadge = video.metricool_added_at
    ? `<span class="metricool-badge" title="Added to Metricool calendar on ${escapeHtml(video.metricool_added_at)}">☁️</span>`
    : "";
  el.innerHTML = `
    <video src="${video.video_url}" muted preload="metadata"></video>
    <div class="slot-card-body">
      <div class="slot-card-id">#${video.id} ${metricoolBadge}</div>
      <div class="slot-card-title">${escapeHtml(video.title)}</div>
      <div class="slot-card-actions">
        <button data-action="unqueue">Return to Approve Queue</button>
      </div>
    </div>
  `;
  el.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", String(video.id));
    e.dataTransfer.effectAllowed = "move";
  });
  el.querySelector('[data-action="unqueue"]').addEventListener("click", async (e) => {
    e.stopPropagation();
    const result = await api(`/api/videos/${video.id}/return-to-review`, { method: "POST" });
    if (result.needs_metricool_cleanup) {
      showToast(
        `"${video.title}" was already on the Metricool calendar. Unscheduled here — remove/cancel it in Metricool manually too, this app can't auto-cancel a Metricool post yet.`,
        "error",
        true
      );
    }
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
  await refreshUndoState();
}

async function refreshUndoState() {
  const { canUndo, canRedo } = await api("/api/undo-state");
  document.getElementById("undoBtn").disabled = !canUndo;
  document.getElementById("redoBtn").disabled = !canRedo;
}

document.getElementById("undoBtn").addEventListener("click", async () => {
  await api("/api/undo", { method: "POST" });
  loadAll();
});

document.getElementById("redoBtn").addEventListener("click", async () => {
  await api("/api/redo", { method: "POST" });
  loadAll();
});

document.getElementById("publishBtn").addEventListener("click", async () => {
  const queue = await api("/api/queue");
  const pending = queue.filter((v) => !v.metricool_added_at);
  if (pending.length === 0) {
    showToast("Nothing to publish — every queued video is already on the Metricool calendar.");
    return;
  }
  showToast(
    `${pending.length} video(s) ready to add to the Metricool calendar.`,
    "info",
    true
  );
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  window.location.href = "/login";
});

loadAll();
