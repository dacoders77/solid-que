import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { config } from "./config";

// Lets an external service (Metricool) fetch a specific video/thumbnail
// file without a login session, scoped to exactly that file id via an
// HMAC token — not a general-purpose public file server.
export function signMediaToken(id: number): string {
  return createHmac("sha256", config.sessionSecret).update(String(id)).digest("hex");
}

function validToken(id: number, token: unknown): boolean {
  if (typeof token !== "string") return false;
  const expected = signMediaToken(id);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireSessionOrMediaToken(req: Request, res: Response, next: NextFunction) {
  if (config.authDisabled || req.session.loggedIn) {
    next();
    return;
  }
  const id = Number(req.params.id);
  if (validToken(id, req.query.token)) {
    next();
    return;
  }
  res.status(401).end();
}

export function publicMediaUrl(id: number, kind: "file" | "thumbnail"): string {
  if (!config.publicBaseUrl) return "";
  return `${config.publicBaseUrl}/api/videos/${id}/${kind}?token=${signMediaToken(id)}`;
}
