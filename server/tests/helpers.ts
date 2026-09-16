import pool from "../src/db.js";
import { serverNow } from "../src/time.js";

/**
 * Wipes all reservations before a test file runs, so every test starts
 * from a known state (4 seeded sessions, 3 seeded users, zero bookings).
 * Does not touch users/sessions - those come from 002_seed.sql and are
 * assumed already present in the DB the tests run against.
 */
export async function resetReservations(): Promise<void> {
  await pool.query("DELETE FROM reservations");
  await pool.query("ALTER TABLE reservations AUTO_INCREMENT = 1");
}

/**
 * Inserts a throwaway session with a start_time computed relative to the
 * real clock at test-run time, so tests stay valid regardless of when
 * they're actually run (the fixed seed dates will eventually be in the
 * past). offsetMinutes: positive = future session, negative = already
 * started. Returns the new session's id.
 */
export async function createTestSession(
  title: string,
  capacity: number,
  offsetMinutes: number
): Promise<number> {
  const start = new Date(Date.now() + offsetMinutes * 60_000);
  const startTime = formatForMysql(start);

  const [result]: any = await pool.query(
    "INSERT INTO sessions (title, start_time, capacity) VALUES (?, ?, ?)",
    [title, startTime, capacity]
  );
  return result.insertId;
}

function formatForMysql(date: Date): string {
  // Reuses the same Asia/Kolkata convention as the app itself, so test
  // sessions compare correctly against serverNow() inside the real code.
  const pad = (n: number) => String(n).padStart(2, "0");
  const kolkata = new Date(
    date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );
  return `${kolkata.getFullYear()}-${pad(kolkata.getMonth() + 1)}-${pad(
    kolkata.getDate()
  )} ${pad(kolkata.getHours())}:${pad(kolkata.getMinutes())}:${pad(
    kolkata.getSeconds()
  )}`;
}

/** Deletes sessions created via createTestSession, by id. */
export async function deleteTestSessions(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  // Reservations reference sessions via a FOREIGN KEY, so child rows must
  // go first. This cleanup is test-only - it never runs in the real app,
  // where reservations are deliberately never deleted (see cancellation).
  await pool.query("DELETE FROM reservations WHERE session_id IN (?)", [ids]);
  await pool.query("DELETE FROM sessions WHERE id IN (?)", [ids]);
}

export { serverNow };

/** Pauses execution — used to let a test session's start_time pass. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}