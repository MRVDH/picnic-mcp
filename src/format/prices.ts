import type { CountryCode } from "../types.js";

const LOCALES: Record<CountryCode, string> = { NL: "nl-NL", DE: "de-DE", FR: "fr-FR" };

/** Picnic serves every supported country from the Central European time zone. */
const TIME_ZONE = "Europe/Amsterdam";

const DAY = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});
const TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});
// en-CA formats dates as YYYY-MM-DD.
const DATE = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE });

/** Formats an amount in cents as the country shows prices, e.g. "€ 2,49" for NL. */
export function formatPrice(cents: number, countryCode: CountryCode): string {
  return new Intl.NumberFormat(LOCALES[countryCode], { style: "currency", currency: "EUR" })
    .format(cents / 100)
    .replace(/\s/g, " "); // Intl uses non-breaking spaces
}

/** The date of a timestamp in Picnic's time zone, e.g. "2026-10-23". */
export function formatDate(timestamp: string): string {
  return DATE.format(new Date(timestamp));
}

/** The day of a timestamp, e.g. "Fri 23 Oct". */
export function formatDay(timestamp: string): string {
  return DAY.format(new Date(timestamp));
}

/** The time of a timestamp, e.g. "18:00". */
export function formatTime(timestamp: string): string {
  return TIME.format(new Date(timestamp));
}

/** A day and time, e.g. "Thu 22 Oct, 13:00". */
export function formatDateTime(timestamp: string): string {
  return `${formatDay(timestamp)}, ${formatTime(timestamp)}`;
}

/** Formats a delivery window as e.g. "Thu 23 Oct, 18:00-19:00", or null without a start and end. */
export function formatWindow(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  return `${formatDay(start)}, ${formatTime(start)}-${formatTime(end)}`;
}
