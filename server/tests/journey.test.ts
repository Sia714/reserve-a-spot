import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import {
  resetReservations,
  createTestSession,
  deleteTestSessions,
} from "./helpers.js";

const ALICE = "1";

describe("normal booking journey", () => {
  let sessionId: number;

  beforeAll(async () => {
    await resetReservations();
    sessionId = await createTestSession("Journey Test Session", 3, 60);
  });

  afterAll(async () => {
    await deleteTestSessions([sessionId]);
  });

  it("browse -> book -> appears in bookings -> cancel -> place freed -> can book again", async () => {
    // Browse: session starts with full capacity available.
    const before = await request(app)
      .get("/api/sessions")
      .set("X-Demo-User-Id", ALICE);
    const beforeSession = before.body.sessions.find(
      (s: any) => s.id === sessionId
    );
    expect(beforeSession.remainingPlaces).toBe(3);
    expect(beforeSession.alreadyBooked).toBe(false);

    // Book.
    const book = await request(app)
      .post("/api/reservations")
      .set("X-Demo-User-Id", ALICE)
      .send({ sessionId });
    expect(book.status).toBe(201);
    expect(book.body.outcome).toBe("confirmed");
    const reservationId = book.body.reservationId;

    // Appears in My Bookings.
    const bookings = await request(app)
      .get("/api/bookings")
      .set("X-Demo-User-Id", ALICE);
    expect(
      bookings.body.bookings.some((b: any) => b.reservationId === reservationId)
    ).toBe(true);

    // Session reflects the reduced count.
    const afterBook = await request(app)
      .get("/api/sessions")
      .set("X-Demo-User-Id", ALICE);
    const afterBookSession = afterBook.body.sessions.find(
      (s: any) => s.id === sessionId
    );
    expect(afterBookSession.remainingPlaces).toBe(2);

    // Cancel.
    const cancel = await request(app)
      .delete(`/api/reservations/${reservationId}`)
      .set("X-Demo-User-Id", ALICE);
    expect(cancel.status).toBe(200);
    expect(cancel.body.outcome).toBe("cancelled");

    // Gone from My Bookings, place freed.
    const bookingsAfter = await request(app)
      .get("/api/bookings")
      .set("X-Demo-User-Id", ALICE);
    expect(
      bookingsAfter.body.bookings.some(
        (b: any) => b.reservationId === reservationId
      )
    ).toBe(false);

    const afterCancel = await request(app)
      .get("/api/sessions")
      .set("X-Demo-User-Id", ALICE);
    const afterCancelSession = afterCancel.body.sessions.find(
      (s: any) => s.id === sessionId
    );
    expect(afterCancelSession.remainingPlaces).toBe(3);

    // Can book again - a genuinely new reservation, not the old one revived.
    const rebook = await request(app)
      .post("/api/reservations")
      .set("X-Demo-User-Id", ALICE)
      .send({ sessionId });
    expect(rebook.status).toBe(201);
    expect(rebook.body.reservationId).not.toBe(reservationId);
  });
});