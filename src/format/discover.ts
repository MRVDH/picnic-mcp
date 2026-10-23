import type { CountryCode, ProductTile, PromotionGroup } from "../types.js";
import { type ProductOutput, formatProduct } from "./products.js";

/** A promotion on several products, as a tool shows it to a model. */
export type PromotionOutput = {
  /** For get_promotions, to list its products. */
  promotionId: string;
  name: string;
  /** E.g. "Bv. sojayoghurt". */
  example?: string;
  /** E.g. "2 voor €3.99". */
  label?: string;
};

export function formatPromotion(group: PromotionGroup): PromotionOutput {
  return {
    promotionId: group.id,
    name: group.name,
    ...(group.example && { example: group.example }),
    ...(group.label && { label: group.label }),
  };
}

/** Products from a promotions or favorites page; none of them is marked as bought before. */
export function formatTiles(tiles: ProductTile[], countryCode: CountryCode): ProductOutput[] {
  return tiles.map((tile) => formatProduct({ tile, boughtBefore: false }, countryCode));
}
