import { type ProductOutput, formatProduct } from "../format/products.js";
import type { Cart } from "../types.js";
import type { ToolContext } from "./context.js";

/** At most this many products' replacements are read, each one request. */
const MAX_PRODUCTS = 3;

/** At most this many replacements per product. */
const MAX_REPLACEMENTS = 3;

/**
 * Reads the replacements of the given products that can't be delivered, as products to offer. A
 * product whose replacements can't be read is left out: the model still sees why it can't be
 * delivered.
 */
export async function loadReplacements(
  { client, countryCode, onError }: ToolContext,
  cart: Cart,
  productIds: readonly string[] = cart.items.map((item) => item.productId)
): Promise<Map<string, ProductOutput[]>> {
  const unavailable = [
    ...new Set(
      cart.items
        .filter((item) => item.isUnavailable && productIds.includes(item.productId))
        .map((item) => item.productId)
    ),
  ].slice(0, MAX_PRODUCTS);

  const entries = await Promise.all(
    unavailable.map(async (productId): Promise<[string, ProductOutput[]] | null> => {
      try {
        const { replacements } = await client.cart.getReplacements(productId);
        const products = replacements
          .filter((tile) => !tile.isUnavailable)
          .slice(0, MAX_REPLACEMENTS)
          .map((tile) => formatProduct({ tile, boughtBefore: false }, countryCode));
        return [productId, products];
      } catch (error) {
        onError(error);
        return null;
      }
    })
  );
  return new Map(entries.filter((entry) => entry !== null));
}
