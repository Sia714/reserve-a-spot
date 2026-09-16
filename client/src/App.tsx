import { useEffect, useState } from "react";
import { DEMO_USERS } from "./types";
import type { Session, Booking } from "./types";
import {
  getSessions,
  getBookings,
  bookSession,
  cancelReservation,
  type ApiError,
} from "./api";
import "./App.css";

type LoadState = "loading" | "loaded" | "error";
type Toast = { message: string; kind: "success" | "error" } | null;

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as ApiError).message);
  }
  return "Could not reach the server.";
}

export default function App() {
  const [demoUserId, setDemoUserId] = useState<number>(DEMO_USERS[0].id);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsState, setSessionsState] = useState<LoadState>("loading");
  const [sessionsError, setSessionsError] = useState("");

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingsState, setBookingsState] = useState<LoadState>("loading");
  const [bookingsError, setBookingsError] = useState("");

  // sessionId currently being booked, so its button shows "Booking…"
  const [bookingInFlight, setBookingInFlight] = useState<number | null>(null);
  // reservationId currently being cancelled
  const [cancelInFlight, setCancelInFlight] = useState<number | null>(null);
  // reservation pending the "are you sure" confirmation
  const [confirmTarget, setConfirmTarget] = useState<Booking | null>(null);

  const [toast, setToast] = useState<Toast>(null);

  function showToast(message: string, kind: "success" | "error") {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 3000);
  }

  async function loadSessions() {
    setSessionsState("loading");
    try {
      const data = await getSessions(demoUserId);
      setSessions(data.sessions);
      setSessionsState("loaded");
    } catch (err) {
      setSessionsError(errorMessage(err));
      setSessionsState("error");
    }
  }

  async function loadBookings() {
    setBookingsState("loading");
    try {
      const data = await getBookings(demoUserId);
      setBookings(data.bookings);
      setBookingsState("loaded");
    } catch (err) {
      setBookingsError(errorMessage(err));
      setBookingsState("error");
    }
  }

  // Both lists depend on who the current demo user is, so both reload
  // whenever the selector changes.
  useEffect(() => {
    loadSessions();
    loadBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoUserId]);

    // Refresh both lists whenever the user comes back to this tab. This is
  // exactly the stale-availability scenario: a second tab/device may have
  // changed server state while this tab was unfocused, so re-fetch rather
  // than trust whatever is still on screen.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        loadSessions();
        loadBookings();
      }
    }
    function handleFocus() {
      loadSessions();
      loadBookings();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoUserId]);
  
  async function handleBook(sessionId: number) {
    setBookingInFlight(sessionId);
    try {
      const result = await bookSession(demoUserId, sessionId);
      // Only written after the server has actually confirmed - never before.
      if (result.outcome === "confirmed") {
        showToast("Booking confirmed.", "success");
      } else {
        // Stale UI edge case: button was clicked while alreadyBooked was
        // momentarily wrong. Server is still the one deciding the outcome.
        showToast("You already have a place on this session.", "success");
      }
      await Promise.all([loadSessions(), loadBookings()]);
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr?.code === "session-started") {
        showToast("That session has already started.", "error");
      } else if (apiErr?.code === "session-not-found") {
        showToast("This session no longer exists.", "error");
      } else {
        // Covers "full" - someone else took the last place first.
        // Refresh so the card shows the corrected, server-confirmed state.
        showToast(errorMessage(err), "error");
      }
      await loadSessions();
    } finally {
      setBookingInFlight(null);
    }
  }

  function handleCancelClick(booking: Booking) {
    setConfirmTarget(booking);
  }

  async function handleConfirmCancel() {
    if (!confirmTarget) return;
    const reservationId = confirmTarget.reservationId;
    setConfirmTarget(null);
    setCancelInFlight(reservationId);
    try {
      await cancelReservation(demoUserId, reservationId);
      showToast("Booking cancelled successfully.", "success");
      // Booking disappears from My Bookings AND the session's remaining
      // places refresh, in the same round of requests.
      await Promise.all([loadSessions(), loadBookings()]);
    } catch (err) {
      showToast(errorMessage(err), "error");
    } finally {
      setCancelInFlight(null);
    }
  }

  return (
    <div className="app">
      {toast && (
        <div className={`toast toast-${toast.kind}`}>{toast.message}</div>
      )}

      {confirmTarget && (
        <div className="modal-overlay">
          <div className="modal">
            <p>Cancel this booking?</p>
            <p className="modal-subtitle">{confirmTarget.title}</p>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setConfirmTarget(null)}
              >
                Keep booking
              </button>
              <button className="btn btn-danger" onClick={handleConfirmCancel}>
                Cancel booking
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="app-header">
        <h1>Reserve a Spot</h1>
        <label className="user-select">
          Current user:
          <select
            value={demoUserId}
            onChange={(e) => setDemoUserId(Number(e.target.value))}
          >
            {DEMO_USERS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      <main>
        <section>
          <h2>Sessions</h2>

          {sessionsState === "loading" && (
            <p className="status">Loading sessions…</p>
          )}
          {sessionsState === "error" && (
            <p className="status status-error">
              Couldn't load sessions: {sessionsError}
            </p>
          )}
          {sessionsState === "loaded" && sessions.length === 0 && (
            <p className="status">No upcoming sessions.</p>
          )}
          {sessionsState === "loaded" && sessions.length > 0 && (
            <ul className="session-list">
              {sessions.map((s) => (
                <li key={s.id} className="session-card">
                  <div className="session-title">{s.title}</div>
                  <div className="session-meta">
                    {s.startTime.replace("T", " ")} ({s.timezone})
                  </div>
                  <div className="session-meta">
                    {s.remainingPlaces} / {s.capacity} places left
                  </div>
                  <div
                    className={
                      s.availability === "AVAILABLE"
                        ? "badge badge-available"
                        : "badge badge-full"
                    }
                  >
                    {s.availability === "AVAILABLE" ? "Available" : "Full"}
                  </div>
                  {s.alreadyBooked && (
                    <div className="badge badge-booked">You're booked</div>
                  )}

                  {!s.alreadyBooked && s.availability === "AVAILABLE" && (
                    <button
                      className="btn btn-primary"
                      disabled={bookingInFlight === s.id}
                      onClick={() => handleBook(s.id)}
                    >
                      {bookingInFlight === s.id ? "Booking…" : "Book"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="bookings">My Bookings</h2>

          {bookingsState === "loading" && (
            <p className="status">Loading your bookings…</p>
          )}
          {bookingsState === "error" && (
            <p className="status status-error">
              Couldn't load bookings: {bookingsError}
            </p>
          )}
          {bookingsState === "loaded" && bookings.length === 0 && (
            <p className="status">You have no active bookings.</p>
          )}
          {bookingsState === "loaded" && bookings.length > 0 && (
            <ul className="session-list">
              {bookings.map((b) => (
                <li key={b.reservationId} className="session-card">
                  <div className="session-title">{b.title}</div>
                  <div className="session-meta">
                    {b.startTime.replace("T", " ")} ({b.timezone})
                  </div>
                  <div className="badge badge-booked">Confirmed</div>

                  {b.canCancel ? (
                    <button
                      className="btn btn-danger"
                      disabled={cancelInFlight === b.reservationId}
                      onClick={() => handleCancelClick(b)}
                    >
                      {cancelInFlight === b.reservationId
                        ? "Cancelling…"
                        : "Cancel booking"}
                    </button>
                  ) : (
                    <p className="status">
                      This session has already started.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}