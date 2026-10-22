import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";

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
}
