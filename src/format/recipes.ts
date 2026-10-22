import type { CountryCode, Recipe, SearchRecipe } from "../types.js";
import { formatPrice } from "./prices.js";

/** Steps are cut at this many characters each, to keep the output short. */
const MAX_STEP = 600;

export type RecipeSummaryOutput = {
  recipeId: string;
  name: string;
  subtitle?: string;
  /** E.g. "15 min". */
  tags?: string[];
};

export type RecipeIngredientOutput = {
  name?: string;
  /** The product that is added for it. */
  productId?: string;
  /** How many of the product are added. */
  quantity: number;
  /** How much the recipe needs, e.g. "(250 g nodig)". */
  needed?: string;
  price?: string;
  /** False when the ingredient isn't added by default. */
  added: boolean;
  /** Set for ingredients most people have at home, such as oil or salt. */
  cupboard?: true;
  /** Why the ingredient can't be delivered, when it can't. */
  unavailable?: string;
};

/** A recipe as a tool shows it to a model. The user's own note stays out. */
export type RecipeOutput = {
  recipeId: string;
  name: string;
  portions: number;
  cookingTimeMinutes?: number;
  description?: string;
  allergens: { contains: string[]; mayContain: string[] };
  ingredients: RecipeIngredientOutput[];
  steps?: string[];
};

export function formatRecipeSummary(recipe: SearchRecipe): RecipeSummaryOutput {
  return {
    recipeId: recipe.id,
    name: recipe.name,
    ...(recipe.subtitle && { subtitle: recipe.subtitle }),
    ...(recipe.tags.length > 0 && { tags: recipe.tags }),
  };
}

export function formatRecipe(recipe: Recipe, countryCode: CountryCode): RecipeOutput {
  return {
    recipeId: recipe.id,
    name: recipe.name,
    portions: recipe.portions,
    ...(recipe.cookingTimeMinutes !== null && { cookingTimeMinutes: recipe.cookingTimeMinutes }),
    ...(recipe.description && { description: recipe.description }),
    allergens: { contains: recipe.allergens.contains, mayContain: recipe.allergens.mayContain },
    ingredients: recipe.ingredients.map((ingredient) => ({
      ...(ingredient.name && { name: ingredient.name }),
      ...(ingredient.sellingUnitId && { productId: ingredient.sellingUnitId }),
      quantity: ingredient.quantity,
      ...(ingredient.neededText && { needed: ingredient.neededText }),
      ...(ingredient.price !== null && { price: formatPrice(ingredient.price, countryCode) }),
      added: ingredient.checked,
      ...(ingredient.type === "CUPBOARD" && { cupboard: true }),
      ...(!ingredient.isAvailable && {
        unavailable: ingredient.unavailableReason ?? "not available",
      }),
    })),
    ...(recipe.steps.length > 0 && {
      steps: recipe.steps.map((step) =>
        step.length > MAX_STEP ? `${step.slice(0, MAX_STEP)}…` : step
      ),
    }),
  };
}
