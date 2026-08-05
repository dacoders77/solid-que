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

function field(label, valueHtml) {
  return `
    <div class="detail-field">
      <div class="detail-label">${label}</div>
      <div class="detail-value">${valueHtml}</div>
    </div>
  `;
}

function socialLinksHtml(video) {
  const links = [
    ["YouTube", video.youtube_link],
    ["Instagram", video.instagram_link],
    ["Facebook", video.facebook_link],
    ["TikTok", video.tiktok_link],
  ];
  const rows = links.map(([label, url]) =>
    url
      ? `<div><a href="${escapeHtml(url)}" target="_blank" rel="noopener">${label} post ↗</a></div>`
      : `<div class="detail-muted">${label}: not live yet</div>`
  );
  return rows.join("");
}

function metricoolInfoHtml(video) {
  if (!video.metricool_added_at) {
    return `<span class="detail-muted">Not added to Metricool yet</span>`;
  }
  let parsed = {};
  try {
    parsed = video.metricool_post_ids ? JSON.parse(video.metricool_post_ids) : {};
  } catch (e) {
    parsed = {};
  }
  const plannerLink = parsed.plannerUrl
    ? `<div><a href="${escapeHtml(parsed.plannerUrl)}" target="_blank" rel="noopener">Open in Metricool calendar ↗</a></div>`
    : "";
  return `
    <div>Added: ${escapeHtml(video.metricool_added_at)}</div>
    ${plannerLink}
  `;
}

async function loadVideo() {
  const id = window.location.pathname.split("/").pop();
  const detail = document.getElementById("detail");

  let video;
  try {
    video = await api(`/api/videos/${id}`);
  } catch (err) {
    detail.innerHTML = `<div class="empty">Couldn't load video: ${escapeHtml(err.message)}</div>`;
    return;
  }

  document.getElementById("pageTitle").textContent = video.title;
  document.title = `solid-que — ${video.title}`;

  detail.innerHTML = `
    <div class="detail-grid">
      <div class="detail-media">
        <video src="${video.video_url}" controls preload="metadata"></video>
        <div class="detail-actions">
          <button id="openFolderBtn">📁 Open folder</button>
        </div>
      </div>
      <div class="detail-info">
        ${field("Status", `<span class="status-badge">${escapeHtml(video.display_status)}</span>`)}
        ${field("ID", `#${video.id}`)}
        ${field("Title", escapeHtml(video.title))}
        ${field("Description", escapeHtml(video.description).replace(/\n/g, "<br>"))}
        ${field("Source project", escapeHtml(video.source_project) || "—")}
        ${field("Scheduled time", video.scheduled_time ? escapeHtml(video.scheduled_time) : "—")}
        ${field("Metricool", metricoolInfoHtml(video))}
        ${field("Live post links", socialLinksHtml(video))}
        ${field("File path", `<span class="detail-path">${escapeHtml(video.video_path)}</span>`)}
      </div>
    </div>
  `;

  document.getElementById("openFolderBtn").addEventListener("click", async () => {
    try {
      await api(`/api/videos/${video.id}/open-folder`, { method: "POST" });
    } catch (err) {
      showToast(`Couldn't open folder: ${err.message}`, "error");
    }
  });
}

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  window.location.href = "/login";
});

loadVideo();
