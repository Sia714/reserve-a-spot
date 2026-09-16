import { Router } from "express";
import type { RowDataPacket } from "mysql2";
import pool from "./../db.js";
import { APP_TIMEZONE, serverNow } from "./../time.js";

const router = Router();

interface BookingRow extends RowDataPacket {
  reservationId: number;
  sessionId: number;
  title: string;
  startTime: string;
  createdAt: string;
}

/**
 * GET /api/bookings
 *
 * Returns ONLY the current demo identity's active bookings. The user id
 * comes from the validated demo-user context - there is deliberately no
 * userId query parameter, so there is no way for a client to ask for
 * someone else's bookings.
 */
router.get("/", async (req, res, next) => {
  const userId = req.demoUser!.id;
  const now = serverNow();

  try {
    const [rows] = await pool.query<BookingRow[]>(
      `SELECT
         r.id AS reservationId,
         s.id AS sessionId,
         s.title,
         DATE_FORMAT(s.start_time, '%Y-%m-%d %H:%i:%s') AS startTime,
         DATE_FORMAT(r.created_at, '%Y-%m-%dT%H:%i:%s') AS createdAt
       FROM reservations r
       JOIN sessions s ON s.id = r.session_id
       WHERE r.user_id = ? AND r.status = 'ACTIVE'
       ORDER BY s.start_time ASC`,
      [userId]
    );

    const bookings = rows.map((row) => ({
      reservationId: row.reservationId,
      sessionId: row.sessionId,
      title: row.title,
      startTime: row.startTime.replace(" ", "T"),
      timezone: APP_TIMEZONE,
      createdAt: row.createdAt,
      // The server decides cancellability; the UI only renders it.
      canCancel: row.startTime > now,
    }));

    res.json({ timezone: APP_TIMEZONE, bookings });
  } catch (error) {
    next(error);
  }
});

export default router;