import { Router } from "express";
import { db, VideoRow } from "../db";
import { getById, serialize } from "../videos";
import { requireServiceToken } from "../service-auth";

export const publishRouter = Router();
publishRouter.use("/api/publish", requireServiceToken);

// Polled by the Claude scheduled publish task (hourly + on manual request).
// Returns queued videos that are due: no postponed_until in the future,
// and either no scheduled_time set or scheduled_time has passed.
//
// scheduled_time/postponed_until are stored as JS-generated ISO UTC strings
// (e.g. "2026-08-03T14:00:00.000Z"), which don't sort/compare correctly
// against SQLite's own datetime('now') (a different format/timezone). So
// "now" is computed here in JS and passed in as a parameter instead.
publishRouter.get("/api/publish/due", (_req, res) => {
  const nowIso = new Date().toISOString();
  const rows = db
    .prepare(
      `SELECT * FROM videos
       WHERE status = 'queued'
         AND (postponed_until IS NULL OR postponed_until <= ?)
         AND (scheduled_time IS NULL OR scheduled_time <= ?)
       ORDER BY scheduled_time ASC, created_at ASC`
    )
    .all(nowIso, nowIso) as unknown as VideoRow[];
  res.json(rows.map(serialize));
});

// Queued videos not yet pushed into Metricool's calendar. Unlike /due,
// this ignores scheduled_time — the whole point of createScheduledPost is
// to hand Metricool a future date/time, so these get added ahead of time,
// not only once they're due.
publishRouter.get("/api/publish/pending-metricool", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT * FROM videos
       WHERE status = 'queued' AND metricool_added_at IS NULL
       ORDER BY scheduled_time ASC, created_at ASC`
    )
    .all() as unknown as VideoRow[];
  res.json(rows.map(serialize));
});

// Worker (Claude, via the Metricool connector) reports back after
// successfully calling createScheduledPost for all 4 networks.
publishRouter.post("/api/publish/:id/metricool-added", (req, res) => {
  const id = Number(req.params.id);
  const video = getById(id);
  if (!video) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const { post_ids } = req.body ?? {};
  db.prepare(
    `UPDATE videos SET metricool_added_at = datetime('now'), metricool_post_ids = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(post_ids ? JSON.stringify(post_ids) : null, id);
  res.json({ ok: true });
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
