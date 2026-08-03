import { db } from "./db";
import { DAILY_SLOTS } from "./config";

export function dateKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Builds the UTC ISO instant for a given local calendar date + "HH:mm" slot.
export function slotDateTime(dateKey: string, slot: string): string {
  const [h, m] = slot.split(":").map(Number);
  const [y, mo, d] = dateKey.split("-").map(Number);
  return new Date(y, mo - 1, d, h, m, 0, 0).toISOString();
}

function occupiedSlots(): Set<string> {
  const rows = db
    .prepare(
      `SELECT scheduled_time FROM videos WHERE status = 'queued' AND scheduled_time IS NOT NULL`
    )
    .all() as { scheduled_time: string }[];
  return new Set(rows.map((r) => r.scheduled_time));
}

// Finds the earliest date+slot (today or later, not in the past) not
// already taken by another queued video. Overflows to the next day once
// a day's slots are full.
export function nextAvailableSlot(): string {
  const occupied = occupiedSlots();
  const now = new Date();

  for (let dayOffset = 0; dayOffset < 365; dayOffset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
    const dateKey = dateKeyLocal(day);
    for (const slot of DAILY_SLOTS) {
      const candidate = slotDateTime(dateKey, slot);
      if (occupied.has(candidate)) continue;
      if (new Date(candidate).getTime() < now.getTime()) continue;
      return candidate;
    }
  }
  throw new Error("no available publish slot found in the next year");
}
