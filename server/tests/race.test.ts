import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import pool from "../src/db.js";
import {
  resetReservations,
  createTestSession,
  deleteTestSessions,
} from "./helpers.js";

describe("last-place race", () => {
  let sessionId: number;

  beforeAll(async () => {
    await resetReservations();
  });

  afterAll(async () => {
    await deleteTestSessions([sessionId]);
  });

  it("exactly one of two concurrent requests for a capacity-1 session succeeds", async () => {
    sessionId = await createTestSession("Race Test Session", 1, 60);

    // Both requests fired before either resolves - genuinely concurrent
    // against the real MySQL row lock, not a simulation.
    const [alice, bob] = await Promise.all([
      request(app)
        .post("/api/reservations")
        .set("X-Demo-User-Id", "1")
        .send({ sessionId }),
      request(app)
        .post("/api/reservations")
        .set("X-Demo-User-Id", "2")
        .send({ sessionId }),
    ]);

    const statuses = [alice.status, bob.status].sort();
    const outcomes = [alice.body.outcome, bob.body.outcome].sort();

    expect(statuses).toEqual([201, 409]);
    expect(outcomes).toEqual(["confirmed", "full"]);

    // Ground truth: ask the database directly, not the API, for how
    // many active reservations actually exist.
    const [rows]: any = await pool.query(
      "SELECT COUNT(*) AS activeCount FROM reservations WHERE session_id = ? AND status = 'ACTIVE'",
      [sessionId]
    );
    expect(Number(rows[0].activeCount)).toBe(1);
  });

  it("with three concurrent requests against capacity 1, active reservations never exceed capacity", async () => {
    const threeWaySessionId = await createTestSession(
      "Three Way Race Session",
      1,
      60
    );

    const results = await Promise.all([
      request(app)
        .post("/api/reservations")
        .set("X-Demo-User-Id", "1")
        .send({ sessionId: threeWaySessionId }),
      request(app)
        .post("/api/reservations")
        .set("X-Demo-User-Id", "2")
        .send({ sessionId: threeWaySessionId }),
      request(app)
        .post("/api/reservations")
        .set("X-Demo-User-Id", "3")
        .send({ sessionId: threeWaySessionId }),
    ]);

    const confirmedCount = results.filter(
      (r) => r.body.outcome === "confirmed"
    ).length;
    const fullCount = results.filter((r) => r.body.outcome === "full").length;

    expect(confirmedCount).toBe(1);
    expect(fullCount).toBe(2);

    const [rows]: any = await pool.query(
      "SELECT COUNT(*) AS activeCount FROM reservations WHERE session_id = ? AND status = 'ACTIVE'",
      [threeWaySessionId]
    );
    expect(Number(rows[0].activeCount)).toBe(1);

    await deleteTestSessions([threeWaySessionId]);
  });
});