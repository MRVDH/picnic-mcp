import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";

import {
  CART_MAY_HAVE_CHANGED,
  describeError,
  isProductError,
  mayHaveChangedCart,
} from "../errors.js";
import { formatCart, formatCartSummary, formatUnavailability } from "../format/cart.js";
import type { Cart, CartLineItem } from "../types.js";
import { type ToolContext, imageUrls } from "./context.js";
import { productId, quantity } from "./inputs.js";
import { loadReplacements } from "./replacements.js";
import { errorResult, jsonResult, runTool } from "./result.js";

/** At most this many products per add_to_cart call: each is one request to Picnic. */
const MAX_ITEMS = 20;

const NOT_ADDED = "Picnic did not add it. Check the product id with search_products.";
const UNAVAILABLE_HINT =
  "Some products are in the cart but can't be delivered in the selected delivery window: tell the user, and offer the replacements if there are any.";

export function registerCartTools(server: McpServer, context: ToolContext): void {
  const { client, countryCode, onError } = context;

  server.registerTool(
    "get_cart",
    {
      title: "Get cart",
      description:
        "Show the user's Picnic shopping cart: the products with their quantity and price, the total, and the delivery window. " +
        "A product that can't be delivered in that window has `unavailable` with the reason, and `replacements` Picnic offers instead.",
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    () =>
      runTool(async () => {
        const cart = await client.cart.getCart();
        const replacements = await loadReplacements(context, cart);
        return jsonResult(formatCart(cart, countryCode, replacements.byProduct), {
          ...imageUrls(context, cart.items),
          ...replacements.images,
        });
      }, onError)
  );

  server.registerTool(
    "add_to_cart",
    {
      title: "Add to cart",
      description:
        "Add one or more products to the user's Picnic shopping cart. Get the product ids from search_products first; " +
        `put all products the user asked for in one call (at most ${MAX_ITEMS}). ` +
        "Returns each added product with the quantity now in the cart, the products that failed, and the cart total. " +
        "A product that can't be delivered in the selected delivery window has `unavailable` and `replacements`: tell the user and offer them. " +
        'To change how many of a product are in the cart ("make it 4"), use set_cart_quantity instead. ' +
        "This does not place an order.",
      inputSchema: z.object({
        items: z
          .array(z.object({ productId, quantity: quantity("add") }))
          .min(1)
          .max(MAX_ITEMS)
          .describe('The products to add, e.g. [{"productId": "s1004201", "quantity": 2}].'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    ({ items }) =>
      runTool(
        async () => {
          let cart: Cart | undefined;
          /** The quantity this call added, by product id, in the order of the items. */
          const added = new Map<string, number>();
          const failed: { productId: string; error: string }[] = [];

          for (const [index, item] of items.entries()) {
            try {
              cart = await client.cart.addProductToCart(item.productId, item.quantity);
              if (linesOf(cart, item.productId).length === 0) {
                failed.push({ productId: item.productId, error: NOT_ADDED });
              } else {
                added.set(item.productId, (added.get(item.productId) ?? 0) + item.quantity);
              }
            } catch (error) {
              onError(error);
              const message = describeError(error);
              failed.push({
                productId: item.productId,
                error: mayHaveChangedCart(error) ? `${message} ${CART_MAY_HAVE_CHANGED}` : message,
              });
              // An error that isn't about this product (the auth key, an outage) hits the rest too.
              if (!isProductError(error)) {
                for (const rest of items.slice(index + 1)) {
                  failed.push({
                    productId: rest.productId,
                    error: "Not tried after the error above.",
                  });
                }
                break;
              }
            }
          }

          if (!cart || added.size === 0) {
            return errorResult(
              failed.map((item) => `${item.productId}: ${item.error}`).join("\n") || NOT_ADDED
            );
          }

          const lines = [...added.keys()].map((id) => linesOf(cart, id));
          const unavailableIds = lines
            .filter((productLines) => productLines.some((line) => line.isUnavailable))
            .map((productLines) => productLines[0].productId);
          const alreadyInCart = lines.some(
            (productLines) => quantityOf(productLines) > (added.get(productLines[0].productId) ?? 0)
          );
          const replacements =
            unavailableIds.length > 0
              ? await loadReplacements(context, cart, unavailableIds)
              : undefined;
          const hints = [
            ...(unavailableIds.length > 0 ? [UNAVAILABLE_HINT] : []),
            ...(failed.length > 0 ? ["Some products were not added: see `failed`."] : []),
            ...(alreadyInCart
              ? [
                  'Some products were in the cart already, so quantityInCart is more than was added. If the user asked for a total ("make it 4"), correct it with set_cart_quantity.',
                ]
              : []),
          ];

          return jsonResult(
            {
              ...(hints.length > 0 && { next: hints.join(" ") }),
              added: lines.map((productLines) => {
                const unavailableLine = productLines.find((line) => line.isUnavailable);
                const id = productLines[0].productId;
                return {
                  productId: id,
                  name: productLines[0].name,
                  quantityInCart: quantityOf(productLines),
                  ...(unavailableLine &&
                    formatUnavailability(unavailableLine, replacements?.byProduct.get(id))),
                };
              }),
              ...(failed.length > 0 && { failed }),
              cart: formatCartSummary(cart, countryCode),
            },
            {
              ...imageUrls(
                context,
                lines.map((productLines) => productLines[0])
              ),
              ...replacements?.images,
            }
          );
        },
        onError,
        { changesCart: true }
      )
  );

  server.registerTool(
    "remove_from_cart",
    {
      title: "Remove from cart",
      description:
        "Remove a product from the user's Picnic shopping cart. Get the product id from get_cart. " +
        "Returns the quantity left in the cart and the cart total.",
      inputSchema: z.object({ productId, quantity: quantity("remove") }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    ({ productId, quantity }) =>
      runTool(
        async () => {
          const cart = await client.cart.removeProductFromCart(productId, quantity);
          return jsonResult({
            removed: { productId, quantityInCart: quantityOf(linesOf(cart, productId)) },
            cart: formatCartSummary(cart, countryCode),
          });
        },
        onError,
        { changesCart: true }
      )
  );

  server.registerTool(
    "set_cart_quantity",
    {
      title: "Set cart quantity",
      description:
        'Set how many of a product are in the user\'s Picnic shopping cart, e.g. when the user says "make it 3". ' +
        "0 removes the product. Get the product id from get_cart or search_products. " +
        "Returns the quantity now in the cart and the cart total.",
      inputSchema: z.object({
        productId,
        quantity: z
          .number()
          .int()
          .min(0)
          .max(50)
          .describe("How many should be in the cart. 0 removes the product."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    ({ productId, quantity }) =>
      runTool(
        async () => {
          let cart = await client.cart.getCart();
          const difference = quantity - quantityOf(linesOf(cart, productId));
          if (difference > 0) cart = await client.cart.addProductToCart(productId, difference);
          if (difference < 0)
            cart = await client.cart.removeProductFromCart(productId, -difference);

          const lines = linesOf(cart, productId);
          if (quantity > 0 && lines.length === 0) return errorResult(NOT_ADDED);
          const unavailableLine = lines.find((line) => line.isUnavailable);
          const replacements = unavailableLine
            ? await loadReplacements(context, cart, [productId])
            : undefined;
          return jsonResult(
            {
              ...(unavailableLine && { next: UNAVAILABLE_HINT }),
              product: {
                productId,
                ...(lines[0] && { name: lines[0].name }),
                quantityInCart: quantityOf(lines),
                ...(unavailableLine &&
                  formatUnavailability(unavailableLine, replacements?.byProduct.get(productId))),
              },
              cart: formatCartSummary(cart, countryCode),
            },
            { ...imageUrls(context, lines.slice(0, 1)), ...replacements?.images }
          );
        },
        onError,
        { changesCart: true }
      )
  );
}

/** The lines of a product: more than one when it was also added for a recipe. */
function linesOf(cart: Cart, productId: string): CartLineItem[] {
  return cart.items.filter((item) => item.productId === productId);
}

function quantityOf(lines: CartLineItem[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}
