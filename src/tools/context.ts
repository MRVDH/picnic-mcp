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

/** The image URLs of products, by product id, leaving out products without an image. */
export function imageUrls(
  { client }: ToolContext,
  products: Iterable<{ productId: string; imageId: string | null }>
): Record<string, string> {
  const urls: Record<string, string> = {};
  for (const { productId, imageId } of products) {
    if (imageId) urls[productId] = client.catalog.getImageUrl(imageId, "large");
  }
  return urls;
}
