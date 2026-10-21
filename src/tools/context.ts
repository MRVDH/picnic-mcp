import type PicnicClient from "picnic-api";

import type { CountryCode } from "../types.js";

/** What the tools share: the Picnic client and the account's country. */
export type ToolContext = {
  client: PicnicClient;
  countryCode: CountryCode;
  onError: (error: unknown) => void;
};

/** The language Picnic's search expects in each country. */
export const SEARCH_LANGUAGES: Record<CountryCode, string> = {
  NL: "Dutch",
  DE: "German",
  FR: "French",
};
