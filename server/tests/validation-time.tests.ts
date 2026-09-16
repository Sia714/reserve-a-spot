import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import {
  resetReservations,
  createTestSession,
  deleteTestSessions,
  sleep,
} from "./helpers.js";

const ALICE = "1";

describe("validation and time rules", () => {
  let pastSessionId: number;
  let expiringSessionId: number;

  beforeAll(async () => {
    await resetReservations();
    // Already started - for the "booking after start" rejection.
    pastSessionId = await createTestSession("Already Started Session", 3, -60);
    // Starts in ~3 seconds - booked now while future, then we wait for
    // it to pass to test cancellation rejection.
    expiringSessionId = await createTestSession(
      "About To Start Session",
      3,
      0.05
    );
  });

  afterAll(async () => {
    await deleteTestSessions([pastSessionId, expiringSessionId]);
  });

  it("rejects non-numeric sessionId without touching state", async () => {
    const res = await request(app)
      .post("/api/reservations")
      .set("X-Demo-User-Id", ALICE)
      .send({ sessionId: "abc" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("invalid-session-id");
  });

  it("rejects a nonexistent sessionId", async () => {
    const res = await request(app)
      .post("/api/reservations")
      .set("X-Demo-User-Id", ALICE)
      .send({ sessionId: 999999 });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("session-not-found");
  });

  it("rejects booking a session that has already started", async () => {
    const res = await request(app)
      .post("/api/reservations")
      .set("X-Demo-User-Id", ALICE)
      .send({ sessionId: pastSessionId });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("session-started");

    const bookings = await request(app)
      .get("/api/bookings")
      .set("X-Demo-User-Id", ALICE);
    expect(
      bookings.body.bookings.some((b: any) => b.sessionId === pastSessionId)
    ).toBe(false);
  });

  it("rejects cancelling a state-changing cancellation once the session has started", async () => {
    // Book while it's still (barely) in the future.
    const book = await request(app)
      .post("/api/reservations")
      .set("X-Demo-User-Id", ALICE)
      .send({ sessionId: expiringSessionId });
    expect(book.status).toBe(201);
    const reservationId = book.body.reservationId;

    // Let the session's start_time pass.
    await sleep(3500);

    const cancel = await request(app)
      .delete(`/api/reservations/${reservationId}`)
      .set("X-Demo-User-Id", ALICE);
    expect(cancel.status).toBe(409);
    expect(cancel.body.code).toBe("session-started");

    // Still active - the rejected cancellation changed nothing.
    const bookings = await request(app)
      .get("/api/bookings")
      .set("X-Demo-User-Id", ALICE);
    expect(
      bookings.body.bookings.some((b: any) => b.reservationId === reservationId)
    ).toBe(true);
  });

  it("an already-cancelled retry stays harmless even after the session starts", async () => {
    // pastSessionId never got a reservation (booking it was rejected above),
    // so create+cancel one on a session that's about to start, then let it
    // pass and retry the cancel - should stay a clean no-op, not an error.
    const soonId = await createTestSession("Soon Session", 3, 0.05);
    const book = await request(app)
      .post("/api/reservations")
      .set("X-Demo-User-Id", ALICE)
      .send({ sessionId: soonId });
    const reservationId = book.body.reservationId;

    const cancelWhileFuture = await request(app)
      .delete(`/api/reservations/${reservationId}`)
      .set("X-Demo-User-Id", ALICE);
    expect(cancelWhileFuture.body.outcome).toBe("cancelled");

    await sleep(3500);

    const retryAfterStart = await request(app)
      .delete(`/api/reservations/${reservationId}`)
      .set("X-Demo-User-Id", ALICE);
    expect(retryAfterStart.status).toBe(200);
    expect(retryAfterStart.body.outcome).toBe("already-cancelled");

    await deleteTestSessions([soonId]);
  });
});