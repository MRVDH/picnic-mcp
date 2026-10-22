import { type ProductOutput, formatProduct } from "../format/products.js";
import type { Cart } from "../types.js";
import { type ToolContext, imageUrls } from "./context.js";
import type { ImageUrls } from "./result.js";

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
  context: ToolContext,
  cart: Cart,
  productIds: readonly string[] = cart.items.map((item) => item.productId)
): Promise<{ byProduct: Map<string, ProductOutput[]>; images: ImageUrls }> {
  const { client, countryCode, onError } = context;
  const unavailable = [
    ...new Set(
      cart.items
        .filter((item) => item.isUnavailable && productIds.includes(item.productId))
        .map((item) => item.productId)
    ),
  ].slice(0, MAX_PRODUCTS);

  const entries = await Promise.all(
    unavailable.map(async (productId) => {
      try {
        const { replacements } = await client.cart.getReplacements(productId);
        const tiles = replacements.filter((tile) => !tile.isUnavailable).slice(0, MAX_REPLACEMENTS);
        return {
          productId,
          products: tiles.map((tile) => formatProduct({ tile, boughtBefore: false }, countryCode)),
          images: imageUrls(
            context,
            tiles.map((tile) => ({ productId: tile.id, imageId: tile.imageId }))
          ),
        };
      } catch (error) {
        onError(error);
        return null;
      }
    })
  );
  const found = entries.filter((entry) => entry !== null);
  return {
    byProduct: new Map(found.map((entry) => [entry.productId, entry.products])),
    images: Object.assign({}, ...found.map((entry) => entry.images)),
  };
}
