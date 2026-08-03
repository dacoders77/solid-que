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
  // Shared secret for machine-to-machine callers (render pipeline ingest,
  // Claude publish worker) that aren't browser sessions.
  serviceToken: process.env.SERVICE_TOKEN ?? "",
  dbPath: path.resolve(process.env.DB_PATH ?? "./data/solid-que.db"),
  storageDir: path.resolve(process.env.STORAGE_DIR ?? "./storage"),
};

// Default Metricool posting slots per day, in local server time.
export const DAILY_SLOTS = ["10:00", "10:15", "10:30"];
