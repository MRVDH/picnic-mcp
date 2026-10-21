import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";

import { formatCart, formatCartSummary, formatUnavailability } from "../format/cart.js";
import type { Cart, CartLineItem } from "../types.js";
import type { ToolContext } from "./context.js";
import { errorResult, jsonResult, runTool } from "./result.js";

const productId = z
  .string()
  .trim()
  .regex(/^s\d+$/, "Use a product id from search_products or get_cart, e.g. s1004201.")
  .describe("The product id from search_products or get_cart, e.g. s1004201.");

const quantity = (what: string) =>
  z.number().int().min(1).max(50).default(1).describe(`How many to ${what}. Default 1.`);

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
      runTool(async () => jsonResult(formatCart(await client.cart.getCart(), countryCode)), onError)
  );

  server.registerTool(
    "add_to_cart",
    {
      title: "Add to cart",
      description:
        "Add a product to the user's Picnic shopping cart. Get the product id from search_products first. " +
        "Returns the product with the quantity now in the cart, and the cart total. " +
        "If the product can't be delivered in the selected delivery window, it says so and lists `replacements`: tell the user and offer them. " +
        "This does not place an order.",
      inputSchema: z.object({ productId, quantity: quantity("add") }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    ({ productId, quantity }) =>
      runTool(async () => {
        const cart = await client.cart.addProductToCart(productId, quantity);
        const lines = linesOf(cart, productId);
        if (lines.length === 0) {
          return errorResult(
            `Picnic did not add ${productId}. Check the product id with search_products.`
          );
        }
        const unavailableLine = lines.find((line) => line.isUnavailable);
        return jsonResult({
          ...(unavailableLine && {
            next: "The product is in the cart, but it can't be delivered in the selected delivery window. Tell the user, and offer the replacements if there are any.",
          }),
          added: {
            productId,
            name: lines[0].name,
            quantityInCart: quantityOf(lines),
            ...(unavailableLine && formatUnavailability(unavailableLine, countryCode)),
          },
          cart: formatCartSummary(cart, countryCode),
        });
      }, onError)
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
      runTool(async () => {
        const cart = await client.cart.removeProductFromCart(productId, quantity);
        return jsonResult({
          removed: { productId, quantityInCart: quantityOf(linesOf(cart, productId)) },
          cart: formatCartSummary(cart, countryCode),
        });
      }, onError)
  );
}

/** The lines of a product: more than one when it was also added for a recipe. */
function linesOf(cart: Cart, productId: string): CartLineItem[] {
  return cart.items.filter((item) => item.productId === productId);
}

function quantityOf(lines: CartLineItem[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}
