import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";

import { formatCartSummary } from "../format/cart.js";
import { formatRecipe, formatRecipeSummary } from "../format/recipes.js";
import { SEARCH_LANGUAGES, type ToolContext } from "./context.js";
import { jsonResult, runTool } from "./result.js";

/** At most this many recipes in search results. */
const MAX_RECIPES = 8;

const recipeId = z
  .string()
  .trim()
  .min(1)
  .describe("The recipeId from search_recipes or get_recipe.");

const portions = z
  .number()
  .int()
  .min(1)
  .max(20)
  .optional()
  .describe("The number of portions. Leave out for the recipe's default.");

export function registerRecipeTools(server: McpServer, context: ToolContext): void {
  const { client, countryCode, onError } = context;
  const language = SEARCH_LANGUAGES[countryCode];

  server.registerTool(
    "search_recipes",
    {
      title: "Search recipes",
      description:
        `Search Picnic's recipes. Write the query in ${language}, e.g. a dish or an ingredient. ` +
        "Returns recipe ids for get_recipe and add_recipe_to_cart.",
      inputSchema: z.object({
        query: z.string().trim().min(1).describe(`What to search for, in ${language}.`),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ query }) =>
      runTool(async () => {
        const results = await client.catalog.getSearchResults(query, { context: "MEALS" });
        const recipes = results.recipes.slice(0, MAX_RECIPES).map(formatRecipeSummary);
        return jsonResult({
          ...(recipes.length === 0 && { next: "No recipes found. Try another search term." }),
          recipes,
        });
      }, onError)
  );

  server.registerTool(
    "get_recipe",
    {
      title: "Get recipe",
      description:
        "Get a Picnic recipe: its ingredients with the products that are added for them, allergens and steps. " +
        "Ingredients with `added: false` aren't added to the cart by default; `cupboard` ones are things most people have at home.",
      inputSchema: z.object({ recipeId, portions }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ recipeId, portions }) =>
      runTool(
        async () =>
          jsonResult(
            formatRecipe(await client.recipe.getRecipe(recipeId, { portions }), countryCode)
          ),
        onError
      )
  );

  server.registerTool(
    "add_recipe_to_cart",
    {
      title: "Add recipe to cart",
      description:
        "Add the ingredients of a Picnic recipe to the user's cart, for the given number of portions. " +
        "Only after the user chose the recipe. Returns the portions and the cart total. This does not place an order.",
      inputSchema: z.object({ recipeId, portions }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    ({ recipeId, portions }) =>
      runTool(async () => {
        const result = await client.recipe.addRecipeToCart(recipeId, { portions });
        const cart = await client.cart.getCart();
        const recipe = cart.recipes.find((item) => item.id === recipeId);
        return jsonResult({
          ...(result.anyUnavailableIngredient && {
            next: "Some ingredients can't be delivered. Tell the user; get_cart shows which ones and their replacements.",
          }),
          added: {
            recipeId,
            ...(recipe && { name: recipe.title }),
            portions: result.assignedNumberOfPortions,
          },
          cart: formatCartSummary(cart, countryCode),
        });
      }, onError)
  );

  server.registerTool(
    "remove_recipe_from_cart",
    {
      title: "Remove recipe from cart",
      description:
        "Remove a recipe and the ingredients that were added for it from the user's cart. " +
        "Returns the number of products removed and the cart total.",
      inputSchema: z.object({ recipeId }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    ({ recipeId }) =>
      runTool(async () => {
        const result = await client.recipe.removeRecipeFromCart(recipeId);
        const cart = await client.cart.getCart();
        const removedCount = result.SURemoved.reduce((sum, item) => sum + item.quantity, 0);
        return jsonResult({
          removed: { recipeId, productsRemoved: removedCount },
          cart: formatCartSummary(cart, countryCode),
        });
      }, onError)
  );
}
