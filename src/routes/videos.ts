import { Router } from "express";
import fs from "node:fs";
import { db } from "../db";
import { getById, listByStatus, listQueue, nextQueuePosition, serialize } from "../videos";

export const videosRouter = Router();

videosRouter.get("/api/videos/pending", (_req, res) => {
  res.json(listByStatus("pending_review"));
});

videosRouter.get("/api/queue", (_req, res) => {
  res.json(listQueue());
});

videosRouter.get("/api/videos/:id", (req, res) => {
  const video = getById(Number(req.params.id));
  if (!video) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(serialize(video));
});

// Approve: moves a pending_review video into the queue at the end.
videosRouter.post("/api/videos/:id/approve", (req, res) => {
  const id = Number(req.params.id);
  const video = getById(id);
  if (!video) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const position = nextQueuePosition();
  db.prepare(
    `UPDATE videos SET status = 'queued', queue_position = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(position, id);
  res.json({ ok: true });
});

// Reject: deletes the file and the DB row entirely.
videosRouter.post("/api/videos/:id/reject", (req, res) => {
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

// Postpone: pulls a video out of the active queue until a given time.
videosRouter.post("/api/videos/:id/postpone", (req, res) => {
  const id = Number(req.params.id);
  const { until } = req.body ?? {};
  const video = getById(id);
  if (!video) {
    res.status(404).json({ error: "not found" });
    return;
  }
  db.prepare(
    `UPDATE videos SET postponed_until = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(typeof until === "string" ? until : null, id);
  res.json({ ok: true });
});

// Reorder: move a queued video up or down one position (swap with neighbor).
videosRouter.post("/api/videos/:id/move", (req, res) => {
  const id = Number(req.params.id);
  const { direction } = req.body ?? {};
  if (direction !== "up" && direction !== "down") {
    res.status(400).json({ error: "direction must be 'up' or 'down'" });
    return;
  }

  const queue = listQueue();
  const index = queue.findIndex((v) => v.id === id);
  if (index === -1) {
    res.status(404).json({ error: "not found in queue" });
    return;
  }

  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= queue.length) {
    res.json({ ok: true }); // already at the edge, no-op
    return;
  }

  const current = queue[index];
  const neighbor = queue[swapIndex];
  const currentPos = current.queue_position;
  const neighborPos = neighbor.queue_position;

  db.prepare(`UPDATE videos SET queue_position = ?, updated_at = datetime('now') WHERE id = ?`).run(
    neighborPos,
    current.id
  );
  db.prepare(`UPDATE videos SET queue_position = ?, updated_at = datetime('now') WHERE id = ?`).run(
    currentPos,
    neighbor.id
  );

  res.json({ ok: true });
});

// Set an explicit scheduled publish time for a queued video.
videosRouter.post("/api/videos/:id/schedule", (req, res) => {
  const id = Number(req.params.id);
  const { scheduled_time } = req.body ?? {};
  const video = getById(id);
  if (!video) {
    res.status(404).json({ error: "not found" });
    return;
  }
  db.prepare(
    `UPDATE videos SET scheduled_time = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(typeof scheduled_time === "string" ? scheduled_time : null, id);
  res.json({ ok: true });
});
