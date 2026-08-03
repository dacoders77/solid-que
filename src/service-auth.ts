import type { Request, Response, NextFunction } from "express";
import { config } from "./config";

// Guards machine-to-machine endpoints (video ingest, publish worker) with a
// shared-secret header instead of the browser session cookie.
export function requireServiceToken(req: Request, res: Response, next: NextFunction) {
  if (config.serviceToken && req.get("X-Service-Token") === config.serviceToken) {
    next();
    return;
  }
  res.status(401).json({ error: "invalid or missing X-Service-Token" });
}
