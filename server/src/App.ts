import express from "express";
import type { NextFunction, Request, Response } from "express";
import { requireDemoUser } from "./demoUser.js";
import sessionsRouter from "./routes/sessions.js";
import bookingsRouter from "./routes/bookings.js";
import reservationsRouter from "./routes/reservations.js";
import cors from "cors";
const app = express();

app.use(
  cors({
    origin: "http://localhost:5173",
    // X-Demo-User-Id is a non-standard header, so it must be explicitly
    // allowed or the browser blocks it at the preflight stage.
    allowedHeaders: ["Content-Type", "X-Demo-User-Id"],
  })
);
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ message: "Server is running" });
});

app.use("/api/sessions", requireDemoUser, sessionsRouter);
app.use("/api/bookings", requireDemoUser, bookingsRouter);
app.use("/api/reservations", requireDemoUser, reservationsRouter);

// Central error handler. Logs the real error server-side, returns a generic
// message so no stack traces, SQL or credentials reach the client.
app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
  // Malformed JSON bodies are rejected by express.json() as SyntaxError.
  // That is invalid input (400), not a server fault (500).
  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({
      outcome: "failed",
      code: "invalid-json",
      message: "Request body is not valid JSON.",
    });
    return;
  }

  console.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, error);
  res.status(500).json({
    outcome: "failed",
    code: "server-error",
    message: "Unexpected server error.",
  });
});

export default app;