/**
 * Single time convention for the whole app.
 *
 * MySQL DATETIME carries no timezone, so every start_time, created_at and
 * cancelled_at in this project is Asia/Kolkata wall-clock time. This module
 * is the ONLY place that decides what "now" means. Listing, booking and
 * cancellation all compare against serverNow() so they can never disagree.
 *
 * Browser-provided time is never used for any correctness decision.
 */
export const APP_TIMEZONE = "Asia/Kolkata";

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Formats a Date as a MySQL DATETIME string in the app timezone. */
export function toAppDateTime(date: Date): string {
  const parts = formatter.formatToParts(date);
  const get = (type: string): string =>
    parts.find((part) => part.type === type)!.value;

  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get(
    "minute"
  )}:${get("second")}`;
}

/** The authoritative server clock, as a MySQL-comparable DATETIME string. */
export function serverNow(): string {
  return toAppDateTime(new Date());
}