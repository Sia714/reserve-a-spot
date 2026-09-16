import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { resetReservations } from "./helpers.js";

describe("test harness", () => {
  beforeAll(async () => {
    await resetReservations();
  });

  it("reaches the real server and real MySQL", async () => {
    const health = await request(app).get("/api/health");
    expect(health.status).toBe(200);

    const sessions = await request(app)
      .get("/api/sessions")
      .set("X-Demo-User-Id", "1");

    expect(sessions.status).toBe(200);
    expect(sessions.body.sessions.length).toBeGreaterThanOrEqual(4);
  });

  it("rejects an unknown demo user", async () => {
    const res = await request(app)
      .get("/api/sessions")
      .set("X-Demo-User-Id", "999");

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("unknown-demo-user");
  });
});