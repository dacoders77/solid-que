import { db, VideoRow } from "./db";

export type VideoRowWithUrls = VideoRow & { video_url: string; thumbnail_url: string };

// Files live wherever the render pipeline put them (never moved by this
// app), so playback is served by id through a streaming route rather than
// a static mount tied to one folder.
export function serialize(row: VideoRow): VideoRowWithUrls {
  return {
    ...row,
    video_url: `/api/videos/${row.id}/file`,
    thumbnail_url: row.thumbnail_path ? `/api/videos/${row.id}/thumbnail` : "",
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
      `SELECT * FROM videos WHERE status = 'queued' ORDER BY scheduled_time ASC, created_at ASC`
    )
    .all() as unknown as VideoRow[];
  return rows.map(serialize);
}

export function getById(id: number): VideoRow | undefined {
  return db.prepare(`SELECT * FROM videos WHERE id = ?`).get(id) as
    | VideoRow
    | undefined;
}
