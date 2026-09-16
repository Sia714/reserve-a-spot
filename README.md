# Reserve a Spot

A small full-stack reservation application that allows users to browse upcoming sessions, reserve a place, view their bookings, cancel reservations, and rebook after cancellation.

The application uses three fixed demo identities rather than real authentication, as real authentication is out of scope for the assignment.

## Tech Stack

### Frontend

- React
- TypeScript
- Vite
- CSS

### Backend

- Node.js
- Express
- TypeScript
- mysql2

### Database

- MySQL

### Testing

- Vitest
- Supertest
- Real MySQL database for behavioral and concurrency testing

---

## Features

- Browse future sessions
- Display session start time and timezone
- Display remaining places and available/full status
- Three fixed demo users through a labelled selector
- Book a session
- View My Bookings
- Cancel a reservation
- Rebook after cancellation
- Distinguish confirmed, full, already-booked and failed outcomes
- Server-side validation and ownership checks
- Stale-availability handling
- Responsive phone-width layout
- Loading, empty and error states
- Persistent booking state backed by MySQL

---

## Project Structure

```text
reserve-a-spot/
├── client/
│   └── ...
├── server/
│   ├── src/
│   ├── tests/
│   └── sql/
│       ├── 001_schema.sql
│       └── 002_seed.sql
├── .gitignore
└── README.md
```

---

# Setup

## Prerequisites

- Node.js
- npm
- MySQL 8.x

## 1. Install dependencies

From the project root:

```bash
cd server
npm install

cd ../client
npm install
```

## 2. Create the database

Create the database in MySQL:

```sql
CREATE DATABASE reserve_a_spot;
```

Run the SQL files in order:

```text
server/sql/001_schema.sql
server/sql/002_seed.sql
```

The schema creates the required users, sessions and reservations tables and indexes.

The seed creates:

- 3 fixed demo users
- 4 future sessions
- session capacities including both 1 and 3

## 3. Configure the server

Create:

```text
server/.env
```

using:

```text
server/.env.example
```

Example:

```env
PORT=5000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=reserve_a_spot
```

The actual database password is kept only in the local `.env` file and is not committed.

## 4. Start the backend

```bash
cd server
npm run dev
```

The API runs on:

```text
http://localhost:5000
```

## 5. Start the frontend

In another terminal:

```bash
cd client
npm run dev
```

Open the Vite URL shown in the terminal.

---

# Database Design

The database is the source of truth for reservation state.

`remainingPlaces` is not stored as a mutable database field. It is derived from:

```text
capacity - active reservations
```

This avoids maintaining a second mutable counter that could become inconsistent with reservation state.

Cancelled reservations remain in the database, but only reservations with `status = ACTIVE` count toward capacity.

There is intentionally no unconditional unique constraint on `(user_id, session_id)`, because a user must be able to rebook after cancelling an earlier reservation.

---

# Booking Correctness

Booking is performed inside a MySQL transaction.

The relevant session row is first locked using:

```sql
SELECT ... FOR UPDATE
```

The server then:

1. Checks that the session exists and has not started.
2. Checks whether the current user already has an active reservation.
3. Counts active reservations.
4. Rejects the booking if the session is full.
5. Inserts the reservation if a place is available.
6. Commits the transaction.

Locking the session row serializes concurrent booking attempts for the same session while allowing bookings for unrelated sessions to proceed independently.

---

# Time Handling

The application uses a single explicit time convention:

```text
Asia/Kolkata
```

The server uses a dedicated `serverNow()` helper for session listing, booking and cancellation.

This avoids making application behavior implicitly dependent on the timezone configuration of the MySQL server/session. The database stores session times as `DATETIME`, while the application explicitly defines the timezone used for server-side comparisons.

---

# API Behavior

## `GET /api/sessions`

Returns future sessions with:

- session ID
- title
- start time
- timezone
- capacity
- remaining places
- availability
- whether the current demo user is already booked

## `GET /api/bookings`

Returns only active bookings belonging to the current demo user.

The endpoint does not accept an arbitrary client-supplied user ID for selecting whose bookings to return.

## `POST /api/reservations`

Accepts a session ID and resolves the current demo user from the validated demo-user identity.

Possible outcomes include:

- `confirmed`
- `already-booked`
- `full`
- validation/not-found errors

## `DELETE /api/reservations/:id`

Cancels a specific reservation after verifying ownership.

The operation is based on the reservation ID rather than a user/session pair, so retrying an old cancellation cannot accidentally cancel a later reservation.

---

# Demo Identity

The application intentionally uses three fixed demo users selected through a labelled UI selector.

The selected identity is sent to the backend and validated against the `users` table.

Unknown demo identities are rejected by the server.

This is a demonstration identity mechanism, not authentication. Real authentication is outside the assignment scope.

---

# Frontend Behavior

The frontend does not optimistically confirm bookings or cancellations.

A successful state change is shown only after the server confirms the operation.

When a booking request receives a `full` response because the UI had stale availability, the frontend displays the error and refetches the sessions so the displayed availability is corrected.

The application also refetches session data when the browser tab becomes visible again, helping correct availability that changed while the tab was inactive.

After a successful cancellation, the bookings and sessions are refetched so the freed place is reflected by the server-derived state and the session can be booked again.

---

# Automated Tests

The backend has automated behavioral tests using Vitest and Supertest against the real MySQL database.

Current result:

```text
10/10 tests passing
```

The test suite covers the six required scenarios:

1. **Normal journey**
   - Booking appears in My Bookings.
   - Cancellation frees the place.
   - The session can be booked again.

2. **Last-place race**
   - Two users concurrently request a capacity-1 session.
   - Exactly one booking succeeds.
   - The other receives a clear full/conflict result.
   - The final active reservation count does not exceed capacity.

3. **Repeated booking**
   - A user cannot have more than one active reservation for a session.
   - Retrying a completed booking returns the existing reservation/already-booked result without consuming another place.
   - Simultaneous duplicate requests are also covered.

4. **Repeated cancellation**
   - Cancelling twice does not free more than one place.
   - Retrying an old cancellation cannot cancel a later reservation.

5. **Access control**
   - A user cannot access another user's private booking data.
   - A user cannot cancel another user's reservation.
   - Unknown demo identities are rejected.

6. **Validation/time**
   - Invalid inputs and session IDs do not change state.
   - New bookings and state-changing cancellations are rejected after the session has started.
   - Completed cancellations can safely be retried as harmless no-ops.

The concurrency test uses genuine concurrent requests with `Promise.all()` against the live MySQL database and verifies the final active reservation count directly.

Test-only past sessions are created as temporary rows, leaving the four required seeded future sessions unchanged.

---

# Manual Verification

The following manual checks were performed:

- **Mobile layout:** verified at phone-width.
- **Failed network request:** verified using browser DevTools offline mode; the UI displays an error rather than showing a false success.
- **Stale availability:** verified using two browser tabs with different demo identities. One user can take the last place while the other tab still displays the previous availability; the stale booking request is rejected by the server with `full`, and the frontend refetches the session and displays `0 / 1` and `Full`.
- **Persistence after restart:** verified by restarting the application and confirming that reservation state remains stored in MySQL.

---

# Plan vs Actual

The original plan was divided into three two-hour milestones.

## Milestone 1 — Foundation & booking backend

**Estimate:** 2 hours  
**Actual:** 3 hours

Completed:

- Project setup
- MySQL database
- Schema + migrations
- Seeded four sessions + three users
- API structure
- Booking/cancellation business logic
- Concurrency strategy

The milestone took approximately one additional hour due to database setup and backend foundation work.

## Milestone 2 — UI & complete user journey

**Estimate:** 2 hours  
**Actual:** 1.5 hours

Completed:

- Session browsing
- Demo-user selector
- Booking
- My Bookings
- Cancellation
- Loading/error/empty/full states
- Mobile layout

This milestone was completed approximately 30 minutes under the original estimate.

## Milestone 3 — Verification & handover

**Estimate:** 2 hours  
**Actual:** 1 hour

Completed:

- Automated behavioral tests
- Concurrency/race test against real MySQL
- Validation/access-control tests
- Persistence check

The remaining time was used for final documentation and the demonstration video.

### Actual Timeline

- **14 Sep, 4:00–5:00 PM:** Initial project setup and database foundation
- **15 Sep, 5:00–7:00 PM:** Schema/migrations, seed, API structure, booking/cancellation logic and concurrency strategy
- **16 Sep, 12:00–1:30 PM:** Frontend and complete user journey
- **16 Sep, 4:00–5:00 PM:** Verification and remaining handover work

No major scope change was required.

---

# Short Answers

## 1. What did you keep simple, and which correctness guarantee would you refuse to cut?

I kept identity management simple by using three fixed demo users with a server-validated identity instead of building authentication, sessions or tokens, since real authentication is out of scope. I would not compromise the invariant that active reservations never exceed a session's capacity, including under concurrent requests, because that is the core correctness guarantee of the reservation system.

## 2. How do you prevent two requests taking the last place? What is risky about "check availability, then insert"?

Each booking runs inside a MySQL transaction and first locks the relevant session row with `SELECT ... FOR UPDATE`, so concurrent requests for the same session are serialized before the capacity check and insert. A separate availability check followed by an insert has a race window where two requests can both observe the last available place and both insert, exceeding capacity; this behavior is verified with concurrent requests against the real MySQL database.

## 3. If a booking commits but its response is lost, what happens when the user retries?

The retry enters the same transaction path and finds the user's existing active reservation before inserting another one, returning the existing reservation with an `already-booked` outcome. This prevents the retry from consuming another place, and the same behavior also protects against simultaneous duplicate requests from the same user.

## 4. After release, how would you investigate an incorrect place count and distinguish a stale UI from wrong database state?

The database is the source of truth because `remainingPlaces` is derived from `capacity - COUNT(active reservations)` rather than stored as mutable state. I would compare the session capacity and active reservation count directly in MySQL with the value returned by the API and displayed by the UI: if the database/API value is correct but the UI is stale, the client needs a refetch; if the database state violates capacity, I would investigate the reservation transaction and any code path that could bypass its locking rules.

## 5. Define your AI-driven Development workflow.

I used AI for focused, incremental development tasks, reviewed the proposed changes and reasoning, challenged assumptions, implemented the changes, and immediately verified them with type checks, API checks, tests or manual behavior. An accepted suggestion was the session-row `FOR UPDATE` transaction design, which I verified with a real concurrent MySQL test; I also challenged the original implicit MySQL timezone dependency and replaced it with the explicit `time.ts` convention used by the application.

---

# AI Evidence

**AI tool used:** Claude

### Representative prompt excerpt

> "I'm building the "Reserve a Spot" assignment with a six-hour timebox.
> Please help me implement it incrementally rather than generating the entire application at once.

> Requirements I want to preserve:
> React + TypeScript frontend
> Node + Express + TypeScript backend
> MySQL as the persistent database
> Three fixed demo users, with identity resolved and validated on the server
> Four future sessions with capacities including 1 and 3
> The database must remain the source of truth for booking state
> Active reservations must never exceed session capacity, including concurrent requests
> A user must have at most one active reservation per session, but must be able to rebook after cancellation
> Booking and cancellation rules must be enforced server-side, not only through UI state

> For each step, explain the reasoning behind the design and identify any correctness or concurrency risks before suggesting code. Prefer the simplest implementation that satisfies the assignment and avoid adding abstractions or infrastructure that the requirements don't need. After each meaningful change, I will verify it with type checks, API tests, or behavioral tests before moving on."

### Suggestion accepted after checking

The session-row `SELECT ... FOR UPDATE` transaction design was accepted after understanding the locking behavior and verifying it with the real concurrency test against MySQL.

### Suggestion / assumption challenged

The original approach relied on MySQL's `NOW()` and its session/database timezone behavior. I challenged whether that constituted an explicit application time convention and changed the implementation to use a dedicated `time.ts` module with the application's `Asia/Kolkata` convention.

The checks were linked directly to the implementation and automated tests rather than relying only on the AI's explanation.

---

# Verification Commands

The following verification commands/results were run before handover.

### Type check

```bash
cd server
npx tsc --noEmit
```

Result:

```text
Passed
```

### Automated tests

```bash
npm test
```

Result:

```text
10/10 passing
```

---

# Demo Video

Demo video:

`https://www.youtube.com/watch?v=pWVOZDkvbTE`

```

```
