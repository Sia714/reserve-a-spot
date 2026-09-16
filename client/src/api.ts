const BASE_URL = "http://localhost:5000";

export interface ApiError {
  outcome: "failed";
  code: string;
  message: string;
}

/**
 * Thin fetch wrapper. Attaches the current demo identity to every request
 * and normalizes errors so components can just `await` and try/catch.
 */
async function request<T>(
  path: string,
  demoUserId: number,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "X-Demo-User-Id": String(demoUserId),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw data as ApiError;
  }

  return data as T;
}

export function getSessions(demoUserId: number) {
  return request<SessionsResponse>("/api/sessions", demoUserId);
}
import type {
  SessionsResponse,
  BookingsResponse,
  BookingSuccess,
  CancelSuccess,
} from "./types";

export function getBookings(demoUserId: number) {
  return request<BookingsResponse>("/api/bookings", demoUserId);
}

export function bookSession(demoUserId: number, sessionId: number) {
  return request<BookingSuccess>("/api/reservations", demoUserId, {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });
}

export function cancelReservation(demoUserId: number, reservationId: number) {
  return request<CancelSuccess>(
    `/api/reservations/${reservationId}`,
    demoUserId,
    { method: "DELETE" }
  );
}