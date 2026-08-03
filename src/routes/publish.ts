import { Router } from "express";
import { db } from "../db";
import { getById } from "../videos";
import { requireServiceToken } from "../service-auth";

export const publishRouter = Router();
publishRouter.use("/api/publish", requireServiceToken);

// Polled by the Claude scheduled publish task (hourly + on manual request).
// Returns queued videos that are due: no postponed_until in the future,
// and either no scheduled_time set or scheduled_time has passed.
publishRouter.get("/api/publish/due", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT * FROM videos
       WHERE status = 'queued'
         AND (postponed_until IS NULL OR postponed_until <= datetime('now'))
         AND (scheduled_time IS NULL OR scheduled_time <= datetime('now'))
       ORDER BY queue_position ASC, created_at ASC`
    )
    .all();
  res.json(rows);
});

// Marks a video as currently being published (prevents double-processing
// if the worker is triggered manually while the hourly run is also active).
publishRouter.post("/api/publish/:id/start", (req, res) => {
  const id = Number(req.params.id);
  const video = getById(id);
  if (!video) {
    res.status(404).json({ error: "not found" });
    return;
  }
  db.prepare(
    `UPDATE videos SET status = 'publishing', updated_at = datetime('now') WHERE id = ?`
  ).run(id);
  res.json({ ok: true });
});

// Worker reports back the result after attempting to publish to all 4 platforms.
publishRouter.post("/api/publish/:id/result", (req, res) => {
  const id = Number(req.params.id);
  const video = getById(id);
  if (!video) {
    res.status(404).json({ error: "not found" });
    return;
  }

  const {
    success,
    youtube_link,
    instagram_link,
    facebook_link,
    tiktok_link,
    error,
  } = req.body ?? {};

  if (success) {
    db.prepare(
      `UPDATE videos SET
         status = 'published',
         youtube_link = ?,
         instagram_link = ?,
         facebook_link = ?,
         tiktok_link = ?,
         publish_error = '',
         updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      youtube_link ?? "",
      instagram_link ?? "",
      facebook_link ?? "",
      tiktok_link ?? "",
      id
    );
  } else {
    db.prepare(
      `UPDATE videos SET status = 'failed', publish_error = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(typeof error === "string" ? error : "unknown error", id);
  }

  res.json({ ok: true });
});
