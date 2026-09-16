-- Seed data for reserve_a_spot: 3 fixed demo users, 4 future sessions.
-- Capacities intentionally include both 1 (last-place race) and 3.
-- Run after 001_schema.sql, against a fresh reserve_a_spot database.

INSERT INTO users (id, name)
VALUES
    (1, 'Alice'),
    (2, 'Bob'),
    (3, 'Charlie');

INSERT INTO sessions (id, title, start_time, capacity)
VALUES
    (1, 'Morning Yoga',     '2026-09-18 10:00:00', 1),
    (2, 'React Workshop',   '2026-09-18 14:00:00', 3),
    (3, 'C++ Fundamentals', '2026-09-19 11:00:00', 1),
    (4, 'System Design',    '2026-09-19 16:00:00', 3);