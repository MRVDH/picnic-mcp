import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";

import { formatCheaperAlternatives } from "../format/alternatives.js";
import { formatProductDetails } from "../format/product.js";
import { type ToolContext, imageUrls } from "./context.js";
import { productId } from "./inputs.js";
import { jsonResult, runTool } from "./result.js";

export function registerProductTools(server: McpServer, context: ToolContext): void {
  const { client, countryCode, onError } = context;

  server.registerTool(
    "get_product",
    {
      title: "Get product details",
      description:
        "Get the details of a Picnic product: ingredients, allergens, nutrition, storage info, promotion and price. " +
        "Use it for questions such as whether a product contains gluten. Get the product id from search_products or get_cart.",
      inputSchema: z.object({ productId }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ productId }) =>
      runTool(async () => {
        const product = await client.catalog.getProduct(productId);
        return jsonResult(
          formatProductDetails(product, countryCode),
          imageUrls(context, [{ productId: product.id, imageId: product.imageIds[0] ?? null }])
        );
      }, onError)
  );

  server.registerTool(
    "get_cheaper_alternatives",
    {
      title: "Find cheaper alternatives",
      description:
        "Find cheaper versions of a Picnic product: similar products that cost less per kg, litre or piece, cheapest first. " +
        "Use it when the user asks for a cheaper option or wants to save on a product. Get the product id from search_products or get_cart. " +
        "It only reads; to swap a product in the cart, ask the user first.",
      inputSchema: z.object({ productId }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ productId }) =>
      runTool(async () => {
        const result = await client.catalog.getCheaperAlternatives(productId);
        const output = formatCheaperAlternatives(result, countryCode);
        const images = result.alternatives
          .slice(0, output.alternatives.length)
          .map((alternative) => ({
            productId: alternative.id,
            imageId: alternative.imageId || null,
          }));
        return jsonResult(output, imageUrls(context, images));
      }, onError)
  );
}
