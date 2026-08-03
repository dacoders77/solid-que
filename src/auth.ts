import { scryptSync, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { config } from "./config";

declare module "express-session" {
  interface SessionData {
    loggedIn?: boolean;
  }
}

export function verifyPassword(username: string, password: string): boolean {
  if (username !== config.authUsername) return false;
  if (!config.authPasswordHash) return false;

  const [salt, storedHash] = config.authPasswordHash.split(":");
  if (!salt || !storedHash) return false;

  const candidate = scryptSync(password, salt, 64);
  const stored = Buffer.from(storedHash, "hex");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session.loggedIn) {
    next();
    return;
  }
  if (req.path.startsWith("/api/")) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  res.redirect("/login");
}
