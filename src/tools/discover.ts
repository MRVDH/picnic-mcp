import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";

import { formatPromotion, formatTiles } from "../format/discover.js";
import type { ProductTile } from "../types.js";
import { type ToolContext, imageUrls } from "./context.js";
import { errorResult, jsonResult, runTool } from "./result.js";

/** Without a section, this many products and promotions per section, to keep the overview short. */
const OVERVIEW_PRODUCTS = 2;
const OVERVIEW_PROMOTIONS = 3;
/** Without an aisle, this many favorites per aisle. */
const OVERVIEW_FAVORITES = 5;
/** At most this many products in a list. */
const MAX_PRODUCTS = 40;

export function registerDiscoverTools(server: McpServer, context: ToolContext): void {
  const { client, countryCode, onError } = context;
  const images = (tiles: ProductTile[]) =>
    imageUrls(
      context,
      tiles.map((tile) => ({ productId: tile.id, imageId: tile.imageId }))
    );

  server.registerTool(
    "get_promotions",
    {
      title: "Get promotions",
      description:
        "List what is on promotion at Picnic this week. Without input it lists the sections (e.g. per category) with a few products and promotions each. " +
        "Pass a section title for all products and promotions in it, or a promotionId for the products of one promotion. " +
        "Products have ids for add_to_cart.",
      inputSchema: z.object({
        section: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe(
            "A section title from the overview, e.g. a category. Leave out for the overview."
          ),
        promotionId: z
          .string()
          .trim()
          .regex(/^[\w-]+$/, "Use a promotionId from get_promotions.")
          .optional()
          .describe("A promotionId from get_promotions, for the products of that promotion."),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ section, promotionId }) =>
      runTool(async () => {
        if (promotionId) {
          const group = await client.catalog.getPromotionGroup(promotionId);
          const products = group.products.slice(0, MAX_PRODUCTS);
          return jsonResult(
            {
              ...(products.length === 0 && {
                next: "This promotion has no products (any more). Try get_promotions without input.",
              }),
              promotion: group.name,
              products: formatTiles(products, countryCode),
            },
            images(products)
          );
        }

        const { sections } = await client.catalog.getPromotions();
        if (section) {
          const found = sections.find(
            (candidate) => candidate.title.toLowerCase() === section.toLowerCase()
          );
          if (!found) {
            return errorResult(
              `No section "${section}". The sections are: ${sections.map((s) => s.title).join(", ")}.`
            );
          }
          const products = found.products.slice(0, MAX_PRODUCTS);
          return jsonResult(
            {
              section: found.title,
              products: formatTiles(products, countryCode),
              promotions: found.groups.map(formatPromotion),
              ...(found.groups.length > 0 && {
                next: "For the products of a promotion: get_promotions with its promotionId.",
              }),
            },
            images(products)
          );
        }

        const shown = sections.map((candidate) => ({
          section: candidate,
          products: candidate.products.slice(0, OVERVIEW_PRODUCTS),
        }));
        return jsonResult(
          {
            next: "For everything in a section: get_promotions with its title. For the products of a promotion: get_promotions with its promotionId.",
            sections: shown.map(({ section, products }) => ({
              title: section.title,
              products: formatTiles(products, countryCode),
              promotions: section.groups.slice(0, OVERVIEW_PROMOTIONS).map(formatPromotion),
              more:
                Math.max(0, section.products.length - OVERVIEW_PRODUCTS) +
                Math.max(0, section.groups.length - OVERVIEW_PROMOTIONS),
            })),
          },
          images(shown.flatMap(({ products }) => products))
        );
      }, onError)
  );

  server.registerTool(
    "get_favorites",
    {
      title: "Get favorites",
      description:
        'List the products the user buys at Picnic, per aisle, e.g. for "what do I usually buy?" or to offer products for "my usual groceries". ' +
        "Without input it lists the aisles with a few products each; pass an aisleId for all of the user's products in that aisle. " +
        "Products have ids for add_to_cart; add only the ones the user asks for.",
      inputSchema: z.object({
        aisleId: z
          .string()
          .trim()
          .regex(/^[A-Za-z_]+$/, "Use an aisleId from get_favorites, e.g. DAIRY.")
          .optional()
          .describe("An aisleId from get_favorites, e.g. DAIRY. Leave out for the overview."),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ aisleId }) =>
      runTool(async () => {
        if (aisleId) {
          const products = (await client.catalog.getFavoritesInAisle(aisleId.toUpperCase())).slice(
            0,
            MAX_PRODUCTS
          );
          return jsonResult(
            {
              ...(products.length === 0 && {
                next: "No products in this aisle. Use an aisleId from get_favorites without input.",
              }),
              aisleId: aisleId.toUpperCase(),
              products: formatTiles(products, countryCode),
            },
            images(products)
          );
        }

        const { aisles } = await client.catalog.getFavorites();
        const shown = aisles
          .filter((aisle) => aisle.products.length > 0)
          .map((aisle) => ({ aisle, products: aisle.products.slice(0, OVERVIEW_FAVORITES) }));
        const others = aisles.filter((aisle) => aisle.products.length === 0);
        return jsonResult(
          {
            next:
              shown.length > 0
                ? "These are the first products per aisle, from what the user bought before; it isn't a shopping list, so only add the products the user asks for. For all of them, or for the other aisles: get_favorites with the aisleId."
                : "The user has no favorites yet.",
            aisles: shown.map(({ aisle, products }) => ({
              aisleId: aisle.id,
              name: aisle.title,
              products: formatTiles(products, countryCode),
              ...((!aisle.complete || aisle.products.length > products.length) && { more: true }),
            })),
            ...(others.length > 0 && {
              otherAisles: others.map((aisle) => ({ aisleId: aisle.id, name: aisle.title })),
            }),
          },
          images(shown.flatMap(({ products }) => products))
        );
      }, onError)
  );
}
