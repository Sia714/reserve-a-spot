import type { Request, Response, NextFunction } from "express";
import type { RowDataPacket } from "mysql2";
import pool from "./db.js";

export interface DemoUser {
  id: number;
  name: string;
}

// Lets us attach req.demoUser in a type-safe way.
declare global {
  namespace Express {
    interface Request {
      demoUser?: DemoUser;
    }
  }
}

/**
 * Resolves the demo identity from the X-Demo-User-Id header.
 * This is NOT authentication - it is the assignment's intentionally
 * switchable demo identity. It only guarantees that the identity is
 * one of the seeded demo users, and that the server (not the client)
 * decides which rows a request may see or change.
 */
export async function requireDemoUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const raw = req.header("X-Demo-User-Id");

  if (raw === undefined || raw.trim() === "") {
    res.status(400).json({
      outcome: "failed",
      code: "missing-demo-user",
      message: "X-Demo-User-Id header is required.",
    });
    return;
  }

  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({
      outcome: "failed",
      code: "invalid-demo-user",
      message: "X-Demo-User-Id must be a positive integer.",
    });
    return;
  }

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, name FROM users WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      res.status(400).json({
        outcome: "failed",
        code: "unknown-demo-user",
        message: "Unknown demo identity.",
      });
      return;
    }

    req.demoUser = { id: rows[0].id as number, name: rows[0].name as string };
    next();
  } catch (error) {
    next(error);
  }
}