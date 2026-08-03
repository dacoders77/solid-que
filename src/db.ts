import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { config } from "./config";

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new DatabaseSync(config.dbPath);

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
`);

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
  created_at: string;
  updated_at: string;
}
