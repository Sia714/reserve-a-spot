import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import {
  resetReservations,
  createTestSession,
  deleteTestSessions,
} from "./helpers.js";

const ALICE = "1";

describe("idempotency", () => {
  let sessionId: number;

  beforeAll(async () => {
    await resetReservations();
    sessionId = await createTestSession("Idempotency Test Session", 1, 60);
  });

  afterAll(async () => {
    await deleteTestSessions([sessionId]);
  });

  it("booking the same session twice returns the existing reservation, consumes only one place", async () => {
    const first = await request(app)
      .post("/api/reservations")
      .set("X-Demo-User-Id", ALICE)
      .send({ sessionId });
    expect(first.status).toBe(201);
    expect(first.body.outcome).toBe("confirmed");

    const second = await request(app)
      .post("/api/reservations")
      .set("X-Demo-User-Id", ALICE)
      .send({ sessionId });
    expect(second.status).toBe(200);
    expect(second.body.outcome).toBe("already-booked");
    expect(second.body.reservationId).toBe(first.body.reservationId);

    const sessions = await request(app)
      .get("/api/sessions")
      .set("X-Demo-User-Id", ALICE);
    const session = sessions.body.sessions.find((s: any) => s.id === sessionId);
    expect(session.remainingPlaces).toBe(0);
  });

  it("concurrent duplicate requests from the same user create only one reservation", async () => {
    const concurrentSessionId = await createTestSession(
      "Concurrent Duplicate Test",
      3,
      60
    );

    const [a, b] = await Promise.all([
      request(app)
        .post("/api/reservations")
        .set("X-Demo-User-Id", ALICE)
        .send({ sessionId: concurrentSessionId }),
      request(app)
        .post("/api/reservations")
        .set("X-Demo-User-Id", ALICE)
        .send({ sessionId: concurrentSessionId }),
    ]);

    const outcomes = [a.body.outcome, b.body.outcome].sort();
    // One creates it, the other - serialized behind the session lock -
    // finds it already exists. Order between them is not guaranteed.
    expect(outcomes).toEqual(["already-booked", "confirmed"]);
    expect(a.body.reservationId).toBe(b.body.reservationId);

    const bookings = await request(app)
      .get("/api/bookings")
      .set("X-Demo-User-Id", ALICE);
    const matching = bookings.body.bookings.filter(
      (bk: any) => bk.sessionId === concurrentSessionId
    );
    expect(matching.length).toBe(1);

    await deleteTestSessions([concurrentSessionId]);
  });
});