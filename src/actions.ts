import fs from "node:fs";
import path from "node:path";
import { db, VideoRow } from "./db";
import { getById } from "./videos";

interface ActionEntry {
  type: string;
  before: VideoRow[];
  after: VideoRow[];
}

// Single-user, in-process undo/redo journal. Each mutating action captures
// a full before/after row snapshot for the ids it touches; undo/redo just
// replays the opposite snapshot (including moving files back if a path
// changed, e.g. reject <-> trash).
const undoStack: ActionEntry[] = [];
const redoStack: ActionEntry[] = [];
const MAX_HISTORY = 50;

export function withUndo(type: string, ids: number[], mutate: () => void): void {
  const before = ids.map(getById).filter((r): r is VideoRow => Boolean(r));
  mutate();
  const after = ids.map(getById).filter((r): r is VideoRow => Boolean(r));

  undoStack.push({ type, before, after });
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
}

function moveFileIfNeeded(fromPath: string, toPath: string) {
  if (!fromPath || !toPath || fromPath === toPath) return;
  if (fs.existsSync(fromPath) && !fs.existsSync(toPath)) {
    fs.mkdirSync(path.dirname(toPath), { recursive: true });
    fs.renameSync(fromPath, toPath);
  }
}

function applyRow(target: VideoRow) {
  const current = getById(target.id);
  if (!current) return;

  moveFileIfNeeded(current.video_path, target.video_path);
  moveFileIfNeeded(current.thumbnail_path, target.thumbnail_path);

  db.prepare(
    `UPDATE videos SET
       title = ?, description = ?, transcript = ?, source_project = ?,
       video_path = ?, thumbnail_path = ?, status = ?, queue_position = ?,
       scheduled_time = ?, postponed_until = ?, youtube_link = ?,
       instagram_link = ?, facebook_link = ?, tiktok_link = ?,
       publish_error = ?, metricool_added_at = ?, metricool_post_ids = ?,
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    target.title,
    target.description,
    target.transcript,
    target.source_project,
    target.video_path,
    target.thumbnail_path,
    target.status,
    target.queue_position,
    target.scheduled_time,
    target.postponed_until,
    target.youtube_link,
    target.instagram_link,
    target.facebook_link,
    target.tiktok_link,
    target.publish_error,
    target.metricool_added_at,
    target.metricool_post_ids,
    target.id
  );
}

export function undoLast(): { ok: boolean; type?: string } {
  const entry = undoStack.pop();
  if (!entry) return { ok: false };
  entry.before.forEach(applyRow);
  redoStack.push(entry);
  return { ok: true, type: entry.type };
}

export function redoLast(): { ok: boolean; type?: string } {
  const entry = redoStack.pop();
  if (!entry) return { ok: false };
  entry.after.forEach(applyRow);
  undoStack.push(entry);
  return { ok: true, type: entry.type };
}

export function undoRedoState() {
  return { canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 };
}
