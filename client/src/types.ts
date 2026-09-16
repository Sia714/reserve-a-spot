export interface Session {
  id: number;
  title: string;
  startTime: string;
  timezone: string;
  capacity: number;
  remainingPlaces: number;
  availability: "AVAILABLE" | "FULL";
  alreadyBooked: boolean;
}

export interface SessionsResponse {
  timezone: string;
  sessions: Session[];
}

export interface DemoUser {
  id: number;
  name: string;
}

// Fixed to match the seeded users. Not fetched from the server -
// the server independently validates whatever ID is sent.
export const DEMO_USERS: DemoUser[] = [
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
  { id: 3, name: "Charlie" },
];
export interface Booking {
  reservationId: number;
  sessionId: number;
  title: string;
  startTime: string;
  timezone: string;
  createdAt: string;
  canCancel: boolean;
}

export interface BookingsResponse {
  timezone: string;
  bookings: Booking[];
}

export interface BookingSuccess {
  outcome: "confirmed" | "already-booked";
  reservationId: number;
  sessionId: number;
  remainingPlaces: number;
  message: string;
}

export interface CancelSuccess {
  outcome: "cancelled" | "already-cancelled";
  reservationId: number;
  sessionId: number;
  message: string;
}