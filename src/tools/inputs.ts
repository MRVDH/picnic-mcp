import * as z from "zod";

/** A product (selling unit) id. Rejects a product name before anything is sent to Picnic. */
export const productId = z
  .string()
  .trim()
  .regex(/^s\d+$/, "Use a product id from search_products or get_cart, e.g. s1004201.")
  .describe("The product id from search_products or get_cart, e.g. s1004201.");

export const quantity = (what: string) =>
  z.number().int().min(1).max(50).default(1).describe(`How many to ${what}. Default 1.`);
