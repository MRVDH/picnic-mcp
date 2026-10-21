import type { CountryCode } from "../types.js";

const LOCALES: Record<CountryCode, string> = { NL: "nl-NL", DE: "de-DE", FR: "fr-FR" };

/** Picnic serves every supported country from the Central European time zone. */
const TIME_ZONE = "Europe/Amsterdam";

/** Formats an amount in cents as the country shows prices, e.g. "€ 2,49" for NL. */
export function formatPrice(cents: number, countryCode: CountryCode): string {
  return new Intl.NumberFormat(LOCALES[countryCode], { style: "currency", currency: "EUR" })
    .format(cents / 100)
    .replace(/\s/g, " "); // Intl uses non-breaking spaces
}

/** Formats a delivery window as e.g. "Thu 23 Oct, 18:00-19:00", or null without a start and end. */
export function formatWindow(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(start));
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day}, ${time.format(new Date(start))}-${time.format(new Date(end))}`;
}
