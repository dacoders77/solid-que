import { Router } from "express";
import fs from "node:fs";
import { getById } from "../videos";
import { requireSessionOrMediaToken } from "../media-auth";

// Mounted before the app-wide session gate: the dashboard's own <video>
// player uses the session cookie, but external fetchers (Metricool) have
// no session, so these routes accept a signed ?token= instead. See
// requireSessionOrMediaToken.
export const mediaRouter = Router();

mediaRouter.get("/api/videos/:id/file", requireSessionOrMediaToken, (req, res) => {
  const video = getById(Number(req.params.id));
  if (!video || !fs.existsSync(video.video_path)) {
    res.status(404).end();
    return;
  }
  res.sendFile(video.video_path);
});

mediaRouter.get("/api/videos/:id/thumbnail", requireSessionOrMediaToken, (req, res) => {
  const video = getById(Number(req.params.id));
  if (!video || !video.thumbnail_path || !fs.existsSync(video.thumbnail_path)) {
    res.status(404).end();
    return;
  }
  res.sendFile(video.thumbnail_path);
});
