import { db, VideoRow } from "./db";
import { publicMediaUrl } from "./media-auth";

export type VideoRowWithUrls = VideoRow & {
  video_url: string;
  thumbnail_url: string;
  public_video_url: string;
  public_thumbnail_url: string;
};

// Files live wherever the render pipeline put them (never moved by this
// app), so playback is served by id through a streaming route rather than
// a static mount tied to one folder. video_url/thumbnail_url are relative,
// for the dashboard's own session-authenticated player. public_* are full
// URLs (via the configured tunnel) with a signed token, for external
// fetchers like Metricool that have no session — empty if no public base
// URL is configured yet.
export function serialize(row: VideoRow): VideoRowWithUrls {
  return {
    ...row,
    video_url: `/api/videos/${row.id}/file`,
    thumbnail_url: row.thumbnail_path ? `/api/videos/${row.id}/thumbnail` : "",
    public_video_url: publicMediaUrl(row.id, "file"),
    public_thumbnail_url: row.thumbnail_path ? publicMediaUrl(row.id, "thumbnail") : "",
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
