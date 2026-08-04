import { Router } from "express";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { db, VideoRow } from "../db";
import { getById, listByStatus, listQueue, serialize } from "../videos";
import { nextAvailableSlot, dateKeyLocal, slotDateTime } from "../schedule";
import { DAILY_SLOTS } from "../config";
import { withUndo, undoLast, redoLast, undoRedoState } from "../actions";

export const videosRouter = Router();

videosRouter.get("/api/videos/pending", (_req, res) => {
  res.json(listByStatus("pending_review"));
});

videosRouter.get("/api/videos/trash", (_req, res) => {
  res.json(listByStatus("rejected"));
});

videosRouter.get("/api/queue", (_req, res) => {
  res.json(listQueue());
});

// Calendar grid for the schedule table: one entry per day, each with the
// 3 daily slots and whichever queued video (if any) occupies it.
videosRouter.get("/api/schedule", (req, res) => {
  const days = Math.min(60, Math.max(1, Number(req.query.days) || 14));
  const queue = listQueue();
  const byTime = new Map(queue.map((v) => [v.scheduled_time, v]));

  const today = new Date();
  const grid = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const dateKey = dateKeyLocal(day);
    const slots = DAILY_SLOTS.map((slot) => {
      const datetime = slotDateTime(dateKey, slot);
      return { slot, datetime, video: byTime.get(datetime) ?? null };
    });
    grid.push({ date: dateKey, slots });
  }
  res.json(grid);
});

videosRouter.get("/api/undo-state", (_req, res) => {
  res.json(undoRedoState());
});

videosRouter.post("/api/undo", (_req, res) => {
  res.json(undoLast());
});

videosRouter.post("/api/redo", (_req, res) => {
  res.json(redoLast());
});

videosRouter.get("/api/videos/:id", (req, res) => {
  const video = getById(Number(req.params.id));
  if (!video) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(serialize(video));
});

// Streams the video/thumbnail by id, wherever the file actually lives.
// res.sendFile supports Range requests natively, so <video> seeking works.
videosRouter.get("/api/videos/:id/file", (req, res) => {
  const video = getById(Number(req.params.id));
  if (!video || !fs.existsSync(video.video_path)) {
    res.status(404).end();
    return;
  }
  res.sendFile(video.video_path);
});

videosRouter.get("/api/videos/:id/thumbnail", (req, res) => {
  const video = getById(Number(req.params.id));
  if (!video || !video.thumbnail_path || !fs.existsSync(video.thumbnail_path)) {
    res.status(404).end();
    return;
  }
  res.sendFile(video.thumbnail_path);
});

// Opens the video's source folder in Windows Explorer, on the machine
// running this server. Only meaningful when the dashboard is used from the
// same PC as the server (not over the port-forwarded remote connection).
videosRouter.post("/api/videos/:id/open-folder", (req, res) => {
  const video = getById(Number(req.params.id));
  if (!video) {
    res.status(404).json({ error: "not found" });
    return;
  }
  if (!fs.existsSync(video.video_path)) {
    res.status(404).json({ error: `file does not exist: ${video.video_path}` });
    return;
  }
  // /select, opens the folder AND highlights the file, which is much more
  // obviously "something happened" than opening a bare folder window.
  // explorer.exe's argument parsing is quirky with spaces (e.g. "v2b bad.mp4")
  // when passed via spawn's normal argv array — Node's auto-quoting wraps the
  // whole "/select,path" token in one pair of quotes, which explorer.exe
  // doesn't parse correctly and silently falls back to the default folder.
  // Building the exact command string ourselves with shell:true avoids that.
  const child = spawn(`explorer.exe /select,"${video.video_path}"`, {
    shell: true,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  res.json({ ok: true, opened: video.video_path });
});

// Approve: moves a pending_review video into the queue, auto-assigned to
// the next open daily slot (10:00/10:15/10:30, overflowing to next day).
videosRouter.post("/api/videos/:id/approve", (req, res) => {
  const id = Number(req.params.id);
  const video = getById(id);
  if (!video) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const scheduledTime = nextAvailableSlot();
  withUndo("approve", [id], () => {
    db.prepare(
      `UPDATE videos SET status = 'queued', scheduled_time = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(scheduledTime, id);
  });
  res.json({ ok: true, scheduled_time: scheduledTime });
});

// Send a video back to pending review — from the queue (approved by
// mistake) or from trash (rejected by mistake). Files are never moved by
// this app, so this is a pure status change.
videosRouter.post("/api/videos/:id/return-to-review", (req, res) => {
  const id = Number(req.params.id);
  const video = getById(id);
  if (!video) {
    res.status(404).json({ error: "not found" });
    return;
  }
  withUndo("return-to-review", [id], () => {
    db.prepare(
      `UPDATE videos SET status = 'pending_review', queue_position = NULL, scheduled_time = NULL, postponed_until = NULL, updated_at = datetime('now') WHERE id = ?`
    ).run(id);
  });
  res.json({ ok: true });
});

// Delete forever: permanently removes the file and DB row. Not undoable —
// this is the one truly destructive action in the app, reached only from
// the trash page.
videosRouter.post("/api/videos/:id/delete-forever", (req, res) => {
  const id = Number(req.params.id);
  const video = getById(id);
  if (!video) {
    res.status(404).json({ error: "not found" });
    return;
  }
  if (video.video_path && fs.existsSync(video.video_path)) {
    fs.rmSync(video.video_path, { force: true });
  }
  if (video.thumbnail_path && fs.existsSync(video.thumbnail_path)) {
    fs.rmSync(video.thumbnail_path, { force: true });
  }
  db.prepare(`DELETE FROM videos WHERE id = ?`).run(id);
  res.json({ ok: true });
});

// Reject: soft-deletes — marks the row 'rejected' (shows up in Trash) but
// never touches the file on disk, so this is always undoable.
videosRouter.post("/api/videos/:id/reject", (req, res) => {
  const id = Number(req.params.id);
  const video = getById(id);
  if (!video) {
    res.status(404).json({ error: "not found" });
    return;
  }

  withUndo("reject", [id], () => {
    db.prepare(
      `UPDATE videos SET status = 'rejected', queue_position = NULL, scheduled_time = NULL, postponed_until = NULL, updated_at = datetime('now') WHERE id = ?`
    ).run(id);
  });

  res.json({ ok: true });
});

// Postpone: pulls a video out of the active queue until a given time.
videosRouter.post("/api/videos/:id/postpone", (req, res) => {
  const id = Number(req.params.id);
  const { until } = req.body ?? {};
  const video = getById(id);
  if (!video) {
    res.status(404).json({ error: "not found" });
    return;
  }
  withUndo("postpone", [id], () => {
    db.prepare(
      `UPDATE videos SET postponed_until = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(typeof until === "string" ? until : null, id);
  });
  res.json({ ok: true });
});

// Set an explicit scheduled publish time for a queued video (used by the
// calendar drag-and-drop). If the target slot is already taken by another
// queued video, the two swap slots instead of colliding.
videosRouter.post("/api/videos/:id/schedule", (req, res) => {
  const id = Number(req.params.id);
  const { scheduled_time } = req.body ?? {};
  const video = getById(id);
  if (!video) {
    res.status(404).json({ error: "not found" });
    return;
  }
  if (typeof scheduled_time !== "string") {
    res.status(400).json({ error: "scheduled_time must be an ISO date string" });
    return;
  }

  const occupant = db
    .prepare(
      `SELECT * FROM videos WHERE status = 'queued' AND scheduled_time = ? AND id != ?`
    )
    .get(scheduled_time, id) as VideoRow | undefined;

  const affectedIds = occupant ? [id, occupant.id] : [id];
  withUndo("schedule", affectedIds, () => {
    if (occupant) {
      db.prepare(
        `UPDATE videos SET scheduled_time = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(video.scheduled_time, occupant.id);
    }
    db.prepare(
      `UPDATE videos SET scheduled_time = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(scheduled_time, id);
  });

  res.json({ ok: true });
});
