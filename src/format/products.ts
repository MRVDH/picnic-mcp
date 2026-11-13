import type { CountryCode, ProductTile } from "../types.js";
import { formatComparisonPrice, formatPrice } from "./prices.js";

/** A product as a tool shows it to a model. Optional fields are left out when empty. */
export type ProductOutput = {
  productId: string;
  name: string;
  brand?: string;
  size?: string;
  price: string;
  /** The price before a discount. */
  wasPrice?: string;
  /** The price per kg, litre or piece, to compare package sizes. */
  unitPrice?: string;
  /** Promotion and other labels, e.g. "1+1 gratis". */
  labels?: string[];
  /** Set when the user bought the product before. */
  boughtBefore?: true;
  unavailable?: true;
};

/** A product from the search results, with whether the user bought it before. */
export type Candidate = {
  tile: ProductTile;
  boughtBefore: boolean;
};

/**
 * Builds the model-facing product from an allow-list of fields, so fields picnic-api adds later
 * don't end up in tool output.
 */
export function formatProduct(candidate: Candidate, countryCode: CountryCode): ProductOutput {
  const { tile } = candidate;
  const labels = tile.labels.map((label) => label.text).filter((text): text is string => !!text);
  // Picnic sends no unit price on tiles; picnic-api computes one from the package size.
  const unitPrice =
    tile.unitPrice ??
    (tile.comparisonPrice && formatComparisonPrice(tile.comparisonPrice, countryCode));
  return {
    productId: tile.id,
    name: tile.namePrefix ? `${tile.namePrefix} ${tile.name}` : tile.name,
    ...(tile.brand && { brand: tile.brand }),
    ...(tile.unitQuantity && { size: tile.unitQuantity }),
    price: formatPrice(tile.displayPrice, countryCode),
    ...(tile.originalPrice !== null &&
      tile.originalPrice > tile.displayPrice && {
        wasPrice: formatPrice(tile.originalPrice, countryCode),
      }),
    ...(unitPrice && { unitPrice }),
    ...(labels.length > 0 && { labels }),
    ...(candidate.boughtBefore && { boughtBefore: true }),
    ...(tile.isUnavailable && { unavailable: true }),
  };
}
