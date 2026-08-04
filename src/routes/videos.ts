import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { db, VideoRow } from "../db";
import { getById, listByStatus, listQueue, serialize } from "../videos";
import { nextAvailableSlot, dateKeyLocal, slotDateTime } from "../schedule";
import { DAILY_SLOTS, config } from "../config";
import { withUndo, undoLast, redoLast, undoRedoState } from "../actions";

export const videosRouter = Router();

videosRouter.get("/api/videos/pending", (_req, res) => {
  res.json(listByStatus("pending_review"));
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

// Opens the video's source folder in Windows Explorer, on the machine
// running this server. Only meaningful when the dashboard is used from the
// same PC as the server (not over the port-forwarded remote connection).
videosRouter.post("/api/videos/:id/open-folder", (req, res) => {
  const video = getById(Number(req.params.id));
  if (!video) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const folder = path.dirname(video.video_path);
  if (!fs.existsSync(folder)) {
    res.status(404).json({ error: `folder does not exist: ${folder}` });
    return;
  }
  spawn("explorer.exe", [folder], { detached: true }).unref();
  res.json({ ok: true });
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

// Send a queued video back to pending review (e.g. approved by mistake).
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

// Reject: soft-deletes. The file moves into a trash folder (not permanently
// removed) and the row is marked 'rejected', so this can be undone.
videosRouter.post("/api/videos/:id/reject", (req, res) => {
  const id = Number(req.params.id);
  const video = getById(id);
  if (!video) {
    res.status(404).json({ error: "not found" });
    return;
  }

  withUndo("reject", [id], () => {
    const trashVideosDir = path.join(config.storageDir, "trash", "videos");
    const trashThumbsDir = path.join(config.storageDir, "trash", "thumbnails");
    fs.mkdirSync(trashVideosDir, { recursive: true });
    fs.mkdirSync(trashThumbsDir, { recursive: true });

    let newVideoPath = video.video_path;
    if (video.video_path && fs.existsSync(video.video_path)) {
      newVideoPath = path.join(trashVideosDir, path.basename(video.video_path));
      fs.renameSync(video.video_path, newVideoPath);
    }
    let newThumbPath = video.thumbnail_path;
    if (video.thumbnail_path && fs.existsSync(video.thumbnail_path)) {
      newThumbPath = path.join(trashThumbsDir, path.basename(video.thumbnail_path));
      fs.renameSync(video.thumbnail_path, newThumbPath);
    }

    db.prepare(
      `UPDATE videos SET status = 'rejected', video_path = ?, thumbnail_path = ?, queue_position = NULL, scheduled_time = NULL, postponed_until = NULL, updated_at = datetime('now') WHERE id = ?`
    ).run(newVideoPath, newThumbPath, id);
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
