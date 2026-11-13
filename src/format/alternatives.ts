import type { CheaperAlternatives, CountryCode } from "../types.js";
import { formatComparisonPrice, formatPrice } from "./prices.js";

/** At most this many alternatives in the output, to keep it short. */
const MAX_ALTERNATIVES = 5;

/** A cheaper product as get_cheaper_alternatives shows it to a model. */
export type AlternativeOutput = {
  productId: string;
  name: string;
  size?: string;
  price: string;
  unitPrice: string;
  /** How much less it costs per kg, litre or piece than the product asked about. */
  cheaperBy: string;
};

export type CheaperAlternativesOutput = {
  productId: string;
  /** The product's own price per kg, litre or piece, when its package size has one. */
  unitPrice?: string;
  alternatives: AlternativeOutput[];
  next?: string;
};

/** Builds the model-facing alternatives from an allow-list of fields, cheapest per unit first. */
export function formatCheaperAlternatives(
  result: CheaperAlternatives,
  countryCode: CountryCode
): CheaperAlternativesOutput {
  const alternatives = result.alternatives.slice(0, MAX_ALTERNATIVES).map((alternative) => ({
    productId: alternative.id,
    name: alternative.name,
    ...(alternative.unitQuantity && { size: alternative.unitQuantity }),
    price: formatPrice(alternative.displayPrice, countryCode),
    unitPrice: formatComparisonPrice(alternative.comparisonPrice, countryCode),
    cheaperBy: formatComparisonPrice(
      { ...alternative.comparisonPrice, price: alternative.savingPerUnit },
      countryCode
    ),
  }));

  const next = !result.comparisonPrice
    ? "This product's package size has no weight, volume or piece count, so there is nothing to compare by."
    : alternatives.length === 0
      ? "No similar product costs less per kg, litre or piece."
      : "To swap one in the cart, ask the user first, then add_to_cart the alternative and remove_from_cart the product.";

  return {
    productId: result.productId,
    ...(result.comparisonPrice && {
      unitPrice: formatComparisonPrice(result.comparisonPrice, countryCode),
    }),
    alternatives,
    next,
  };
}
