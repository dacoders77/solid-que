import path from "node:path";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  sessionSecret: required("SESSION_SECRET", "dev-secret-change-me"),
  authUsername: required("AUTH_USERNAME", "admin"),
  authPasswordHash: process.env.AUTH_PASSWORD_HASH ?? "",
  // Kill switch for login while the app is only reachable on localhost.
  // Flip back to false once this is exposed beyond your own machine.
  authDisabled: process.env.AUTH_DISABLED === "true",
  // Shared secret for machine-to-machine callers (render pipeline ingest,
  // Claude publish worker) that aren't browser sessions.
  serviceToken: process.env.SERVICE_TOKEN ?? "",
  dbPath: path.resolve(process.env.DB_PATH ?? "./data/solid-que.db"),
  // Generated cover-frame thumbnails live here — these are new files this
  // app creates itself, not copies/moves of source video (that rule only
  // ever applied to the original render files).
  thumbnailsDir: path.resolve(process.env.THUMBNAILS_DIR ?? "./data/thumbnails"),
  // Public base URL (e.g. a Cloudflare quick tunnel), used to build media
  // URLs external services like Metricool can actually fetch. Empty means
  // no public URL is configured yet.
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, ""),
};

// Default Metricool posting slots per day, in local server time.
export const DAILY_SLOTS = ["10:00", "10:15", "10:30"];
