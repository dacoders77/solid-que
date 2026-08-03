import path from "node:path";
import { db, VideoRow } from "./db";
import { config } from "./config";

export type VideoRowWithUrls = VideoRow & { video_url: string; thumbnail_url: string };

function toStorageUrl(absolutePath: string): string {
  if (!absolutePath) return "";
  const relative = path.relative(config.storageDir, absolutePath).split(path.sep).join("/");
  return `/storage/${encodeURI(relative)}`;
}

export function serialize(row: VideoRow): VideoRowWithUrls {
  return {
    ...row,
    video_url: toStorageUrl(row.video_path),
    thumbnail_url: toStorageUrl(row.thumbnail_path),
  };
}

export function listByStatus(status: string): VideoRowWithUrls[] {
  const rows = db
    .prepare(`SELECT * FROM videos WHERE status = ? ORDER BY created_at DESC`)
    .all(status) as unknown as VideoRow[];
  return rows.map(serialize);
}

export function listQueue(): VideoRowWithUrls[] {
  const rows = db
    .prepare(
      `SELECT * FROM videos WHERE status = 'queued' ORDER BY queue_position ASC, created_at ASC`
    )
    .all() as unknown as VideoRow[];
  return rows.map(serialize);
}

export function getById(id: number): VideoRow | undefined {
  return db.prepare(`SELECT * FROM videos WHERE id = ?`).get(id) as
    | VideoRow
    | undefined;
}

export function nextQueuePosition(): number {
  const row = db
    .prepare(`SELECT MAX(queue_position) as maxPos FROM videos WHERE status = 'queued'`)
    .get() as { maxPos: number | null };
  return (row.maxPos ?? 0) + 1;
}

export function touch(id: number) {
  db.prepare(`UPDATE videos SET updated_at = datetime('now') WHERE id = ?`).run(id);
}
