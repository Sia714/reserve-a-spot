import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import {
  resetReservations,
  createTestSession,
  deleteTestSessions,
} from "./helpers.js";

const ALICE = "1";
const BOB = "2";

describe("access control", () => {
  let sessionId: number;
  let aliceReservationId: number;

  beforeAll(async () => {
    await resetReservations();
    sessionId = await createTestSession("Access Control Test Session", 3, 60);

    const book = await request(app)
      .post("/api/reservations")
      .set("X-Demo-User-Id", ALICE)
      .send({ sessionId });
    aliceReservationId = book.body.reservationId;
  });

  afterAll(async () => {
    await deleteTestSessions([sessionId]);
  });

  it("a user cannot see another user's bookings", async () => {
    const bobBookings = await request(app)
      .get("/api/bookings")
      .set("X-Demo-User-Id", BOB);
    expect(
      bobBookings.body.bookings.some(
        (b: any) => b.reservationId === aliceReservationId
      )
    ).toBe(false);
  });

  it("a user cannot cancel another user's reservation", async () => {
    const res = await request(app)
      .delete(`/api/reservations/${aliceReservationId}`)
      .set("X-Demo-User-Id", BOB);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("not-your-reservation");

    // Confirm it's genuinely untouched, not just rejected in response.
    const stillActive = await request(app)
      .get("/api/bookings")
      .set("X-Demo-User-Id", ALICE);
    expect(
      stillActive.body.bookings.some(
        (b: any) => b.reservationId === aliceReservationId
      )
    ).toBe(true);
  });

  it("rejects an unknown demo identity on every protected route", async () => {
    const sessions = await request(app)
      .get("/api/sessions")
      .set("X-Demo-User-Id", "999");
    expect(sessions.status).toBe(400);

    const bookings = await request(app)
      .get("/api/bookings")
      .set("X-Demo-User-Id", "999");
    expect(bookings.status).toBe(400);

    const post = await request(app)
      .post("/api/reservations")
      .set("X-Demo-User-Id", "999")
      .send({ sessionId });
    expect(post.status).toBe(400);
  });

  it("allows switching between known demo identities", async () => {
    const asAlice = await request(app)
      .get("/api/sessions")
      .set("X-Demo-User-Id", ALICE);
    const asBob = await request(app)
      .get("/api/sessions")
      .set("X-Demo-User-Id", BOB);
    expect(asAlice.status).toBe(200);
    expect(asBob.status).toBe(200);
  });
});