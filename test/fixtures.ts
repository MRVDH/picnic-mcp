// Made-up data in the shape of picnic-api's models. Never copy real account data in here.
import type { Cart, CartLineItem, ProductTile, SearchResults } from "../src/types.js";

export function tile(overrides: Partial<ProductTile> & { id: string }): ProductTile {
  return {
    name: `Product ${overrides.id}`,
    namePrefix: null,
    brand: "Merk",
    qualityCue: null,
    imageId: "image-id",
    displayPrice: 199,
    originalPrice: null,
    unitPrice: null,
    priceRanges: null,
    unitQuantity: "1 stuk",
    labels: [],
    isUnavailable: false,
    numberOfOrders: null,
    ...overrides,
  };
}

/** Search results with a bought-before ("RFY") section and a product group section. */
export function searchResults(
  boughtBefore: ProductTile[],
  other: ProductTile[],
  correctedQuery: string | null = null
): SearchResults {
  const sections = [
    ...(boughtBefore.length > 0
      ? [
          {
            id: "Opnieuw bestellen",
            type: "RFY",
            title: "Opnieuw bestellen",
            products: boughtBefore,
          },
        ]
      : []),
    ...(other.length > 0 ? [{ id: "Groep", type: "VISUAL", title: "Groep", products: other }] : []),
  ];
  return {
    query: "zoekterm",
    correctedQuery,
    products: {
      sections,
      visualFilters: [],
      powerFilters: [],
      textualFilters: [],
      productIdsByFacetId: {},
      sortingOptions: [],
      selectedSorting: "RELEVANCE",
    },
    recipes: [],
  };
}

export function line(overrides: Partial<CartLineItem> & { productId: string }): CartLineItem {
  return {
    id: `line-${overrides.productId}`,
    name: `Product ${overrides.productId}`,
    unitQuantity: "1 stuk",
    imageId: "image-id",
    quantity: 1,
    maxCount: 50,
    displayPrice: 199,
    originalPrice: null,
    priceColor: null,
    priceRanges: null,
    labels: [],
    basePrice: null,
    freshness: null,
    characteristics: [],
    isUnavailable: false,
    unavailableReason: null,
    replacements: [],
    bundlesLink: null,
    recipeId: null,
    ...overrides,
  };
}

export function cart(items: CartLineItem[], overrides: Partial<Cart> = {}): Cart {
  return {
    id: "cart-id",
    mts: 1700000000000,
    items,
    totalCount: items.reduce((sum, item) => sum + item.quantity, 0),
    totalPrice: items.reduce((sum, item) => sum + item.displayPrice, 0),
    discount: 0,
    promotionSavings: 0,
    membershipSavings: 0,
    deposits: [],
    depositTotal: 0,
    fees: [],
    minimumOrderValue: null,
    selectedSlot: null,
    recipes: [],
    ...overrides,
  };
}
