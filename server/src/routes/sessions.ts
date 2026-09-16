import { Router } from "express";
import type { RowDataPacket } from "mysql2";
import pool from "./../db.js";
import { APP_TIMEZONE, serverNow } from "./../time.js";

const router = Router();

interface SessionRow extends RowDataPacket {
  id: number;
  title: string;
  startTime: string;
  capacity: number;
  activeCount: number;
  myActiveCount: number;
}

router.get("/", async (req, res, next) => {
  const userId = req.demoUser!.id;
  const now = serverNow();

  try {
    const [rows] = await pool.query<SessionRow[]>(
      `SELECT
         s.id,
         s.title,
         DATE_FORMAT(s.start_time, '%Y-%m-%dT%H:%i:%s') AS startTime,
         s.capacity,
         COUNT(r.id) AS activeCount,
         SUM(CASE WHEN r.user_id = ? THEN 1 ELSE 0 END) AS myActiveCount
       FROM sessions s
       LEFT JOIN reservations r
         ON r.session_id = s.id
        AND r.status = 'ACTIVE'
       WHERE s.start_time > ?
       GROUP BY s.id, s.title, s.start_time, s.capacity
       ORDER BY s.start_time ASC`,
      [userId, now]
    );

    const sessions = rows.map((row) => {
      const activeCount = Number(row.activeCount);
      const remainingPlaces = Math.max(0, row.capacity - activeCount);

      return {
        id: row.id,
        title: row.title,
        startTime: row.startTime,
        timezone: APP_TIMEZONE,
        capacity: row.capacity,
        remainingPlaces,
        availability: remainingPlaces > 0 ? "AVAILABLE" : "FULL",
        alreadyBooked: Number(row.myActiveCount) > 0,
      };
    });

    res.json({ timezone: APP_TIMEZONE, sessions });
  } catch (error) {
    next(error);
  }
});

export default router;