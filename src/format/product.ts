import type { CountryCode, Product } from "../types.js";
import { formatPrice } from "./prices.js";

/** Long texts are cut at this many characters, to keep the output short. */
const MAX_TEXT = 1500;

/** A product's details as a tool shows them to a model. Optional fields are left out when empty. */
export type ProductDetailsOutput = {
  productId: string;
  name: string;
  brand?: string;
  size?: string;
  /** Left out when picnic-api couldn't read it (it returns 0 then). */
  price?: string;
  wasPrice?: string;
  unitPrice?: string;
  promotion?: string;
  /** Badges, labels and tags, e.g. "XL", "Biologisch", "Diepvries". */
  labels?: string[];
  description?: string;
  allergens: { contains: string[]; mayContain: string[] };
  /** E.g. "Vet: 1,6g". */
  nutrition?: string[];
  /** Sections such as the ingredients and storage info, as markdown. */
  info?: { title: string; content: string }[];
};

/** Builds the model-facing product details from an allow-list of fields. */
export function formatProductDetails(
  product: Product,
  countryCode: CountryCode
): ProductDetailsOutput {
  const labels = [...product.quantityBadges, ...product.labels, ...product.tags]
    .map((label) => label.text)
    .filter(Boolean);
  const nutrition = product.nutritionRows.map((row) =>
    row.value === null ? row.label : `${row.label}: ${row.value}`
  );
  // The page also shows the nutrition table as an info section; leave that one out.
  const nutritionText = lines(
    product.nutritionRows.flatMap((row) =>
      row.value === null ? [row.label] : [row.label, row.value]
    )
  );
  const info = product.infoSections
    .filter(
      (section) => section.content.trim() && lines(section.content.split("\n")) !== nutritionText
    )
    .map((section) => ({ title: section.title, content: cut(section.content) }));
  return {
    productId: product.id,
    name: product.name,
    ...(product.brand && { brand: product.brand }),
    ...(product.unitQuantity && { size: product.unitQuantity }),
    ...(product.displayPrice > 0 && { price: formatPrice(product.displayPrice, countryCode) }),
    ...(product.displayPrice > 0 &&
      product.originalPrice !== null &&
      product.originalPrice > product.displayPrice && {
        wasPrice: formatPrice(product.originalPrice, countryCode),
      }),
    ...(product.unitPrice && { unitPrice: product.unitPrice }),
    ...(product.promotion && { promotion: product.promotion.label }),
    ...(labels.length > 0 && { labels }),
    ...(product.description && { description: cut(product.description) }),
    allergens: {
      contains: product.allergenGroups.contains.map((allergen) => allergen.text),
      mayContain: product.allergenGroups.mayContain.map((allergen) => allergen.text),
    },
    ...(nutrition.length > 0 && { nutrition }),
    ...(info.length > 0 && { info }),
  };
}

/** Joins texts as trimmed, non-empty lines, to compare them. */
function lines(texts: string[]): string {
  return texts
    .map((text) => text.trim())
    .filter(Boolean)
    .join("\n");
}

function cut(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_TEXT ? `${trimmed.slice(0, MAX_TEXT)}…` : trimmed;
}
