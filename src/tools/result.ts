import type { CallToolResult, InputRequiredResult } from "@modelcontextprotocol/server";

import { CART_MAY_HAVE_CHANGED, describeError, mayHaveChangedCart } from "../errors.js";

/** The `_meta` key with the image URLs of the products in a result, by product id. */
export const IMAGES_META_KEY = "picnic-mcp/images";

/** Image URLs by product id. */
export type ImageUrls = Record<string, string>;

/**
 * Returns data as compact JSON text: models read the text, and indentation only costs tokens.
 * Image URLs go in `_meta`, which clients keep from the model, so they cost no tokens.
 */
export function jsonResult(data: unknown, images: ImageUrls = {}): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
    ...(Object.keys(images).length > 0 && { _meta: { [IMAGES_META_KEY]: images } }),
  };
}

export function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/**
 * Runs a tool handler and turns a thrown error into a short tool error. For a tool that changes
 * the cart, the error says when the change may have gone through anyway, so the model checks the
 * cart instead of retrying blindly.
 */
export async function runTool<T extends CallToolResult | InputRequiredResult>(
  run: () => Promise<T>,
  onError: (error: unknown) => void,
  options: { changesCart?: boolean } = {}
): Promise<T | CallToolResult> {
  try {
    return await run();
  } catch (error) {
    onError(error);
    const message = describeError(error);
    return errorResult(
      options.changesCart && mayHaveChangedCart(error)
        ? `${message} ${CART_MAY_HAVE_CHANGED}`
        : message
    );
  }
}
