import { Router } from "express";
import fs from "node:fs";
import { db } from "../db";
import { requireServiceToken } from "../service-auth";

export const ingestRouter = Router();

// Called by the render pipeline (a local script, not a browser) once a video
// is finished, so it authenticates with a shared secret header instead of a
// session cookie.
//
// Files are referenced in place — never moved or copied. video_path/
// thumbnail_path stay pointing at wherever the render pipeline put them
// (the project's own render folder).
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

  const thumbPath =
    typeof thumbnail_path === "string" && thumbnail_path && fs.existsSync(thumbnail_path)
      ? thumbnail_path
      : "";

  const result = db
    .prepare(
      `INSERT INTO videos (title, description, transcript, source_project, video_path, thumbnail_path, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending_review')`
    )
    .run(title, description ?? "", transcript ?? "", source_project ?? "", video_path, thumbPath);

  res.status(201).json({ id: Number(result.lastInsertRowid) });
});
