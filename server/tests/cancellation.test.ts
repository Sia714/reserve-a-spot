import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import {
  resetReservations,
  createTestSession,
  deleteTestSessions,
} from "./helpers.js";

const ALICE = "1";

describe("repeated cancellation", () => {
  let sessionId: number;

  beforeAll(async () => {
    await resetReservations();
    sessionId = await createTestSession("Cancellation Test Session", 3, 60);
  });

  afterAll(async () => {
    await deleteTestSessions([sessionId]);
  });

  it("cancelling twice is a no-op, and a stale cancel cannot touch a later reservation", async () => {
    const first = await request(app)
      .post("/api/reservations")
      .set("X-Demo-User-Id", ALICE)
      .send({ sessionId });
    const firstId = first.body.reservationId;

    const cancelOnce = await request(app)
      .delete(`/api/reservations/${firstId}`)
      .set("X-Demo-User-Id", ALICE);
    expect(cancelOnce.status).toBe(200);
    expect(cancelOnce.body.outcome).toBe("cancelled");

    const cancelTwice = await request(app)
      .delete(`/api/reservations/${firstId}`)
      .set("X-Demo-User-Id", ALICE);
    expect(cancelTwice.status).toBe(200);
    expect(cancelTwice.body.outcome).toBe("already-cancelled");

    // A new reservation for the same user/session.
    const second = await request(app)
      .post("/api/reservations")
      .set("X-Demo-User-Id", ALICE)
      .send({ sessionId });
    expect(second.status).toBe(201);
    const secondId = second.body.reservationId;
    expect(secondId).not.toBe(firstId);

    // Retrying the OLD cancellation must not touch the new reservation.
    const staleCancel = await request(app)
      .delete(`/api/reservations/${firstId}`)
      .set("X-Demo-User-Id", ALICE);
    expect(staleCancel.status).toBe(200);
    expect(staleCancel.body.outcome).toBe("already-cancelled");

    const bookings = await request(app)
      .get("/api/bookings")
      .set("X-Demo-User-Id", ALICE);
    expect(
      bookings.body.bookings.some((b: any) => b.reservationId === secondId)
    ).toBe(true);
  });
});