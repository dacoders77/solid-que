import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { config } from "./config";

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new DatabaseSync(config.dbPath);

// WAL + FULL sync: each commit is durably on disk before the response
// returns, so an abrupt process kill can't lose an already-acknowledged write.
db.exec(`PRAGMA journal_mode = WAL;`);
db.exec(`PRAGMA synchronous = FULL;`);

db.exec(`
  CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    transcript TEXT NOT NULL DEFAULT '',
    source_project TEXT NOT NULL DEFAULT '',
    video_path TEXT NOT NULL,
    thumbnail_path TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending_review',
    queue_position INTEGER,
    scheduled_time TEXT,
    postponed_until TEXT,
    youtube_link TEXT NOT NULL DEFAULT '',
    instagram_link TEXT NOT NULL DEFAULT '',
    facebook_link TEXT NOT NULL DEFAULT '',
    tiktok_link TEXT NOT NULL DEFAULT '',
    publish_error TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
  CREATE INDEX IF NOT EXISTS idx_videos_queue_position ON videos(queue_position);

  CREATE TABLE IF NOT EXISTS network_settings (
    network TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    profile_url TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Set once, on the very first run, and never moved afterward — the
// schedule calendar anchors here so past days stay visible even after
// videos get unqueued/rescheduled and no longer reference that date.
const calendarStart = db
  .prepare(`SELECT value FROM app_meta WHERE key = 'calendar_start_date'`)
  .get() as { value: string } | undefined;
if (!calendarStart) {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  db.prepare(`INSERT INTO app_meta (key, value) VALUES ('calendar_start_date', ?)`).run(
    `${y}-${m}-${d}`
  );
}

const networkCount = (
  db.prepare(`SELECT COUNT(*) as n FROM network_settings`).get() as { n: number }
).n;
if (networkCount === 0) {
  const insertNetwork = db.prepare(
    `INSERT INTO network_settings (network, label, enabled, profile_url) VALUES (?, ?, 1, ?)`
  );
  insertNetwork.run("instagram", "Instagram", "https://www.instagram.com/solid.plumbing.electrical/");
  insertNetwork.run("facebook", "Facebook", "https://www.facebook.com/256804020847358");
  insertNetwork.run("tiktok", "TikTok", "https://www.tiktok.com/@solid.plumbing.electric");
  insertNetwork.run("youtube", "YouTube", "https://www.youtube.com/channel/UCZVCjwfhpN8oiDTJJNT1bgg");
}

// Idempotent migration: add columns that didn't exist in earlier schema
// versions, since CREATE TABLE IF NOT EXISTS doesn't alter existing tables.
const existingColumns = new Set(
  (db.prepare(`PRAGMA table_info(videos)`).all() as { name: string }[]).map((c) => c.name)
);
if (!existingColumns.has("metricool_added_at")) {
  db.exec(`ALTER TABLE videos ADD COLUMN metricool_added_at TEXT`);
}
if (!existingColumns.has("metricool_post_ids")) {
  db.exec(`ALTER TABLE videos ADD COLUMN metricool_post_ids TEXT`);
}

// "queued" = approved and sitting in the publish queue (ordered by queue_position)
export type VideoStatus =
  | "pending_review"
  | "queued"
  | "rejected"
  | "publishing"
  | "published"
  | "failed";

export interface VideoRow {
  id: number;
  title: string;
  description: string;
  transcript: string;
  source_project: string;
  video_path: string;
  thumbnail_path: string;
  status: VideoStatus;
  queue_position: number | null;
  scheduled_time: string | null;
  postponed_until: string | null;
  youtube_link: string;
  instagram_link: string;
  facebook_link: string;
  tiktok_link: string;
  publish_error: string;
  metricool_added_at: string | null;
  metricool_post_ids: string | null;
  created_at: string;
  updated_at: string;
}

export interface NetworkSettingRow {
  network: string;
  label: string;
  enabled: number;
  profile_url: string;
}
