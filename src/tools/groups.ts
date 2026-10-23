import type { McpServer } from "@modelcontextprotocol/server";

import { registerCartTools } from "./cart.js";
import { SEARCH_LANGUAGES, type ToolContext } from "./context.js";
import { registerDeliveryTools } from "./deliveries.js";
import { registerDiscoverTools } from "./discover.js";
import { registerProductTools } from "./product.js";
import { registerRecipeTools } from "./recipes.js";
import { registerSearchProducts } from "./search-products.js";
import { registerSlotTools } from "./slots.js";

/** A set of tools that can be turned on together. */
export type ToolGroup = "cart" | "slots" | "product" | "discover" | "deliveries" | "recipes";

type GroupDefinition = {
  register: (server: McpServer, context: ToolContext) => void;
  /** How to use the group's tools, for the server instructions. */
  instructions: (context: ToolContext) => string;
};

const GROUPS: Record<ToolGroup, GroupDefinition> = {
  cart: {
    register: (server, context) => {
      registerSearchProducts(server, context);
      registerCartTools(server, context);
    },
    instructions: ({ countryCode }) =>
      `To add products: search_products for each (query in ${SEARCH_LANGUAGES[countryCode]}), then one add_to_cart with all product ids. If a search returns choices, ask the user first. To change a quantity: set_cart_quantity.`,
  },
  slots: {
    register: registerSlotTools,
    instructions: () =>
      "To choose when the order is delivered: get_delivery_slots, then select_delivery_slot once the user picked one.",
  },
  product: {
    register: registerProductTools,
    instructions: () => "For a product's ingredients, allergens or nutrition: get_product.",
  },
  discover: {
    register: registerDiscoverTools,
    instructions: () =>
      'For what is on sale: get_promotions. For the products the user usually buys ("my usual groceries"): get_favorites.',
  },
  deliveries: {
    register: registerDeliveryTools,
    instructions: () =>
      'For orders on their way: get_deliveries. To order the same as before: get_deliveries with when "past" and includeProducts.',
  },
  recipes: {
    register: registerRecipeTools,
    instructions: () =>
      "For recipes: search_recipes or get_saved_recipes, get_recipe, then add_recipe_to_cart once the user picked one.",
  },
};

/** Every group, in the order the tools are registered. */
export const TOOL_GROUPS = Object.keys(GROUPS) as ToolGroup[];

/** The groups that are on when none are given: the cart flow and the read-only product tools. */
export const DEFAULT_TOOL_GROUPS: readonly ToolGroup[] = ["cart", "slots", "product", "discover"];

/** Reads a comma-separated list of groups, e.g. "cart,recipes". */
export function parseToolGroups(value: string): ToolGroup[] {
  const groups = value
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  const unknown = groups.filter((name) => !TOOL_GROUPS.includes(name as ToolGroup));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown tool group ${unknown.map((name) => `"${name}"`).join(", ")}. Use any of ${TOOL_GROUPS.join(", ")}.`
    );
  }
  if (groups.length === 0)
    throw new Error(`No tool groups given. Use any of ${TOOL_GROUPS.join(", ")}.`);
  return groups as ToolGroup[];
}

/** Registers the tools of the given groups. */
export function registerToolGroups(
  server: McpServer,
  context: ToolContext,
  groups: readonly ToolGroup[]
): void {
  for (const group of TOOL_GROUPS) {
    if (groups.includes(group)) GROUPS[group].register(server, context);
  }
}

/** How to use the tools of the given groups, for the server instructions. */
export function toolGroupInstructions(context: ToolContext, groups: readonly ToolGroup[]): string {
  return TOOL_GROUPS.filter((group) => groups.includes(group))
    .map((group) => GROUPS[group].instructions(context))
    .join(" ");
}
