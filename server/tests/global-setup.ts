import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config({ override: true });

/**
 * Runs once, before any test file executes. Deletes any leftover
 * test-created sessions (and their reservations) from a previous run
 * that failed before its own afterAll cleanup completed - exactly what
 * happened before the FK-delete-order fix. Seeded sessions always have
 * id 1-4 (server/sql/002_seed.sql); anything above that id is disposable
 * test data. Uses its own standalone connection rather than the app's
 * shared pool, since this script runs in a separate process from the
 * workers that execute the actual test files.
 */
export default async function globalSetup() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
  });

  await connection.query("DELETE FROM reservations WHERE session_id > 4");
  await connection.query("DELETE FROM sessions WHERE id > 4");

  await connection.end();
}