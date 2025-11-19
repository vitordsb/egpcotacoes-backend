import type { Request, Response, NextFunction } from "express";
import { SESSION_COOKIE_NAME, verifySessionToken } from "../session.js";
import * as db from "../db.js";

export async function attachUser(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const token = parseCookieHeader(req.headers.cookie || "");
  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const payload = await verifySessionToken(token);
    const user =
      (await db.getUserByOpenId(payload.openId)) ||
      null;
    req.user = user;
  } catch {
    req.user = null;
  }
  next();
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

function parseCookieHeader(cookieHeader: string): string | undefined {
  const parts = cookieHeader.split(";").map(part => part.trim());
  for (const part of parts) {
    if (part.startsWith(`${SESSION_COOKIE_NAME}=`)) {
      return part.split("=")[1];
    }
  }
  return undefined;
}
