import { Router } from "express";
import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import pool from "./../db.js";
import { APP_TIMEZONE, serverNow } from "./../time.js";

const router = Router();

interface SessionRow extends RowDataPacket {
  id: number;
  title: string;
  capacity: number;
  startTime: string;
}

interface ReservationRow extends RowDataPacket {
  id: number;
  user_id: number;
  session_id: number;
  status: "ACTIVE" | "CANCELLED";
}

interface CountRow extends RowDataPacket {
  activeCount: number;
}

/**
 * POST /api/reservations
 *
 * Outcomes: confirmed (201) | already-booked (200) | full (409)
 *           | invalid input (400) | session not found (404) | failed (500)
 *
 * All availability logic runs inside a transaction that holds an exclusive
 * lock on the single session row, so concurrent requests for the same
 * session serialize and active reservations can never exceed capacity.
 */
router.post("/", async (req, res, next) => {
  const userId = req.demoUser!.id;
  const sessionId: unknown = req.body?.sessionId;

  // Validation happens before any connection is taken: invalid input
  // must never open a transaction or touch database state.
  if (!Number.isInteger(sessionId) || (sessionId as number) <= 0) {
    res.status(400).json({
      outcome: "failed",
      code: "invalid-session-id",
      message: "sessionId must be a positive integer.",
    });
    return;
  }

  const now = serverNow();
  let connection: PoolConnection | undefined;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. Lock the session row. Everything after this is serialized
    //    with respect to other bookings/cancellations for THIS session.
    const [sessionRows] = await connection.query<SessionRow[]>(
      `SELECT id, title, capacity,
              DATE_FORMAT(start_time, '%Y-%m-%d %H:%i:%s') AS startTime
         FROM sessions
        WHERE id = ?
        FOR UPDATE`,
      [sessionId]
    );

    if (sessionRows.length === 0) {
      await connection.rollback();
      res.status(404).json({
        outcome: "failed",
        code: "session-not-found",
        message: "No such session.",
      });
      return;
    }

    const session = sessionRows[0];

    // 2. Time check, using OUR clock, in OUR timezone convention.
    //    Both strings are 'YYYY-MM-DD HH:MM:SS', so lexicographic
    //    comparison is also chronological comparison.
    if (session.startTime <= now) {
      await connection.rollback();
      res.status(409).json({
        outcome: "failed",
        code: "session-started",
        message: "This session has already started.",
      });
      return;
    }

    // 3. Does this user already hold an active place? (idempotency)
    const [existingRows] = await connection.query<ReservationRow[]>(
      `SELECT id
         FROM reservations
        WHERE session_id = ? AND user_id = ? AND status = 'ACTIVE'
        LIMIT 1`,
      [sessionId, userId]
    );

    // 4. How many places are taken right now?
    const [countRows] = await connection.query<CountRow[]>(
      `SELECT COUNT(*) AS activeCount
         FROM reservations
        WHERE session_id = ? AND status = 'ACTIVE'`,
      [sessionId]
    );
    const activeCount = Number(countRows[0].activeCount);

    if (existingRows.length > 0) {
      await connection.commit();
      res.status(200).json({
        outcome: "already-booked",
        reservationId: existingRows[0].id,
        sessionId,
        remainingPlaces: Math.max(0, session.capacity - activeCount),
        message: "You already have a place on this session.",
      });
      return;
    }

    if (activeCount >= session.capacity) {
      await connection.rollback();
      res.status(409).json({
        outcome: "full",
        sessionId,
        remainingPlaces: 0,
        message: "This session is full.",
      });
      return;
    }

    // 5. Safe to insert: we still hold the session lock, so the count
    //    above cannot have changed underneath us.
    const [result] = await connection.query<ResultSetHeader>(
      `INSERT INTO reservations (user_id, session_id, status, created_at)
       VALUES (?, ?, 'ACTIVE', ?)`,
      [userId, sessionId, now]
    );

    await connection.commit();

    res.status(201).json({
      outcome: "confirmed",
      reservationId: result.insertId,
      sessionId,
      title: session.title,
      startTime: session.startTime.replace(" ", "T"),
      timezone: APP_TIMEZONE,
      remainingPlaces: Math.max(0, session.capacity - (activeCount + 1)),
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {
        // Rollback can fail if the connection died; the original
        // error is the one worth reporting.
      }
    }
    next(error);
  } finally {
    connection?.release();
  }
});

/**
 * DELETE /api/reservations/:reservationId
 *
 * Targets a RESERVATION ID, never (user, session). A retried cancellation
 * of reservation #10 can therefore never cancel a later reservation #11
 * for the same user and session.
 *
 * Outcomes: cancelled (200) | already-cancelled (200, harmless no-op)
 *           | invalid id (400) | not found (404) | not yours (403)
 *           | session started (409)
 */
router.delete("/:reservationId", async (req, res, next) => {
  const userId = req.demoUser!.id;
  const reservationId = Number(req.params.reservationId);

  if (!Number.isInteger(reservationId) || reservationId <= 0) {
    res.status(400).json({
      outcome: "failed",
      code: "invalid-reservation-id",
      message: "reservationId must be a positive integer.",
    });
    return;
  }

  const now = serverNow();
  let connection: PoolConnection | undefined;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. Unlocked lookup, purely to discover which session this belongs to,
    //    so we can take locks in the canonical order (session, then reservation).
    const [lookupRows] = await connection.query<ReservationRow[]>(
      `SELECT id, user_id, session_id, status
         FROM reservations
        WHERE id = ?`,
      [reservationId]
    );

    if (lookupRows.length === 0) {
      await connection.rollback();
      res.status(404).json({
        outcome: "failed",
        code: "reservation-not-found",
        message: "No such reservation.",
      });
      return;
    }

    const lookup = lookupRows[0];

    // 2. Ownership check, server-side, against the reservation's real owner.
    //    The client cannot cancel someone else's reservation by supplying
    //    its ID while remaining the current demo identity.
    if (lookup.user_id !== userId) {
      await connection.rollback();
      res.status(403).json({
        outcome: "failed",
        code: "not-your-reservation",
        message: "This reservation belongs to another user.",
      });
      return;
    }

    // 3. Lock the session row first...
    const [sessionRows] = await connection.query<SessionRow[]>(
      `SELECT id, capacity,
              DATE_FORMAT(start_time, '%Y-%m-%d %H:%i:%s') AS startTime
         FROM sessions
        WHERE id = ?
        FOR UPDATE`,
      [lookup.session_id]
    );
    const session = sessionRows[0];

    // 4. ...then re-read the reservation under lock. Its status may have
    //    changed while we were waiting for the session lock.
    const [currentRows] = await connection.query<ReservationRow[]>(
      `SELECT id, status FROM reservations WHERE id = ? FOR UPDATE`,
      [reservationId]
    );
    const current = currentRows[0];

    // 5. Already cancelled: harmless no-op. Checked BEFORE the time rule,
    //    because a retry of a completed cancellation must stay harmless
    //    even once the session has started.
    if (current.status === "CANCELLED") {
      await connection.commit();
      res.status(200).json({
        outcome: "already-cancelled",
        reservationId,
        sessionId: lookup.session_id,
        message: "This reservation was already cancelled.",
      });
      return;
    }

    // 6. A state-CHANGING cancellation requires the session to be future.
    if (session.startTime <= now) {
      await connection.rollback();
      res.status(409).json({
        outcome: "failed",
        code: "session-started",
        message: "This session has already started.",
      });
      return;
    }

    // 7. The status guard makes the UPDATE itself idempotent as a
    //    second line of defence. The row is preserved, never deleted.
    await connection.query<ResultSetHeader>(
      `UPDATE reservations
          SET status = 'CANCELLED', cancelled_at = ?
        WHERE id = ? AND status = 'ACTIVE'`,
      [now, reservationId]
    );

    await connection.commit();

    res.status(200).json({
      outcome: "cancelled",
      reservationId,
      sessionId: lookup.session_id,
      message: "Your place has been released.",
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {
        // See note above.
      }
    }
    next(error);
  } finally {
    connection?.release();
  }
});

export default router;