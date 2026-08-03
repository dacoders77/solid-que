import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { db } from "../db";
import { config } from "../config";
import { requireServiceToken } from "../service-auth";

export const ingestRouter = Router();

// Called by the render pipeline (a local script, not a browser) once a video
// is finished, so it authenticates with a shared secret header instead of a
// session cookie.
ingestRouter.post("/api/videos/ingest", requireServiceToken, (req, res) => {
  const {
    title,
    description,
    transcript,
    source_project,
    video_path,
    thumbnail_path,
  } = req.body ?? {};

  if (typeof title !== "string" || typeof video_path !== "string") {
    res.status(400).json({ error: "title and video_path are required" });
    return;
  }

  if (!fs.existsSync(video_path)) {
    res.status(400).json({ error: `video_path does not exist: ${video_path}` });
    return;
  }

  const videosDir = path.join(config.storageDir, "videos");
  const thumbsDir = path.join(config.storageDir, "thumbnails");
  fs.mkdirSync(videosDir, { recursive: true });
  fs.mkdirSync(thumbsDir, { recursive: true });

  const stamp = Date.now();
  const videoExt = path.extname(video_path) || ".mp4";
  const destVideoPath = path.join(videosDir, `${stamp}${videoExt}`);
  fs.renameSync(video_path, destVideoPath);

  let destThumbPath = "";
  if (typeof thumbnail_path === "string" && thumbnail_path && fs.existsSync(thumbnail_path)) {
    const thumbExt = path.extname(thumbnail_path) || ".jpg";
    destThumbPath = path.join(thumbsDir, `${stamp}${thumbExt}`);
    fs.renameSync(thumbnail_path, destThumbPath);
  }

  const result = db
    .prepare(
      `INSERT INTO videos (title, description, transcript, source_project, video_path, thumbnail_path, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending_review')`
    )
    .run(
      title,
      description ?? "",
      transcript ?? "",
      source_project ?? "",
      destVideoPath,
      destThumbPath
    );

  res.status(201).json({ id: Number(result.lastInsertRowid) });
});
