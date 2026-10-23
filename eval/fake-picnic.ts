// A made-up Picnic for the evaluation: a small catalog and an in-memory cart. Never copy real
// account data in here.
import PicnicClient from "picnic-api";

import type { Cart, ProductTile } from "../src/types.js";
import { cart as cartOf, line, searchResults, tile } from "../test/fixtures.js";

type Product = ProductTile & { boughtBefore?: boolean; searchTerms: string[]; aisle: string };

const product = (
  id: string,
  name: string,
  price: number,
  size: string,
  aisle: string,
  searchTerms: string[],
  extra: Partial<Product> = {}
): Product => ({
  ...tile({ id, name, displayPrice: price, unitQuantity: size, brand: "Picnic" }),
  aisle,
  searchTerms,
  ...extra,
});

/** The catalog. Search terms are Dutch, as Picnic's search in the Netherlands expects. */
export const PRODUCTS: Product[] = [
  product("s1000001", "Halfvolle melk", 119, "1 liter", "DAIRY", ["melk", "halfvolle melk"], {
    boughtBefore: true,
  }),
  product("s1000002", "Volle melk", 129, "1 liter", "DAIRY", ["melk", "volle melk"]),
  product("s1000003", "Scharreleieren", 349, "10 stuks", "DAIRY", ["eieren", "eier"], {
    boughtBefore: true,
  }),
  product("s1000004", "Volkoren brood", 229, "800 gram", "BAKERY", ["brood", "volkoren brood"], {
    boughtBefore: true,
  }),
  product("s1000005", "Bananen", 149, "5 stuks", "FRUIT", ["bananen", "banaan"], {
    boughtBefore: true,
  }),
  product("s1000006", "Pindakaas met stukjes", 329, "350 gram", "GRAINS_SWEETSPREADS", [
    "pindakaas",
  ]),
  product("s1000007", "Pindakaas naturel", 219, "600 gram", "GRAINS_SWEETSPREADS", ["pindakaas"]),
  product(
    "s1000008",
    "Toiletpapier 3-laags",
    449,
    "8 rollen",
    "DRUGSTORE",
    ["toiletpapier", "wc papier"],
    { boughtBefore: true }
  ),
  product("s1000009", "Griekse yoghurt", 189, "500 gram", "DAIRY", ["yoghurt", "griekse yoghurt"], {
    originalPrice: 239,
    labels: [{ position: "bottomLeft", type: "PROMO", text: "20% korting" }],
  }),
  product("s1000010", "Jonge kaas plakken", 299, "250 gram", "DELI", ["kaas"], {
    boughtBefore: true,
  }),
];

/** A recipe whose page link the evaluation shares. */
export const RECIPE_ID = "0123456789abcdef01234567";

const byId = (id: string) => PRODUCTS.find((candidate) => candidate.id === id);

/** A timestamp in Picnic's time zone, `days` from today at `hour`:00. */
function amsterdamTime(days: number, hour: number): string {
  const date = new Date(Date.now() + days * 86_400_000);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(date);
  const offset = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Amsterdam",
    timeZoneName: "longOffset",
  })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")!
    .value.replace("GMT", "");
  return `${day}T${String(hour).padStart(2, "0")}:00:00.000${offset || "+00:00"}`;
}

/** A fake picnic-api client. `calls` records the cart changes, `cart` the current contents. */
export function fakePicnic(initialCart: Record<string, number> = {}) {
  const quantities = new Map(Object.entries(initialCart));
  let selectedSlotId: string | null = null;

  const slots = [1, 2].flatMap((day) =>
    [8, 18, 20].map((hour) => ({
      slotId: `slot-${day}-${hour}`,
      windowStart: amsterdamTime(day, hour),
      windowEnd: amsterdamTime(day, hour + 1),
      cutOffTime: amsterdamTime(day - 1, 22),
      isAvailable: true,
      isSelected: false,
      isGreenChoice: false,
      minimumOrderValue: 3500,
    }))
  );

  const currentCart = (): Cart => {
    const items = [...quantities]
      .filter(([, quantity]) => quantity > 0)
      .map(([id, quantity]) => {
        const found = byId(id)!;
        return line({
          productId: id,
          name: found.name,
          unitQuantity: found.unitQuantity,
          quantity,
          displayPrice: found.displayPrice * quantity,
        });
      });
    const slot = slots.find((candidate) => candidate.slotId === selectedSlotId);
    return cartOf(items, {
      selectedSlot: slot
        ? {
            slotId: slot.slotId,
            state: "EXPLICIT",
            windowStart: slot.windowStart,
            windowEnd: slot.windowEnd,
            isExplicitSelection: true,
          }
        : null,
    } as Partial<Cart>);
  };

  const add = async (id: string, count = 1) => {
    if (!byId(id)) throw new PicnicClient.ProductNotFoundError(id);
    quantities.set(id, (quantities.get(id) ?? 0) + count);
    return currentCart();
  };
  const remove = async (id: string, count = 1) => {
    quantities.set(id, Math.max(0, (quantities.get(id) ?? 0) - count));
    return currentCart();
  };
  const tiles = (products: Product[]): ProductTile[] =>
    products.map(
      ({ boughtBefore: _boughtBefore, searchTerms: _searchTerms, aisle: _aisle, ...rest }) => rest
    );

  const client = {
    catalog: {
      getSearchResults: async (query: string, options: { context?: string } = {}) => {
        const words = query.toLowerCase().trim();
        if (options.context === "MEALS") {
          const results = searchResults([], []);
          return words.includes("pasta")
            ? {
                ...results,
                recipes: [
                  {
                    id: RECIPE_ID,
                    name: "Pasta pesto",
                    subtitle: "met spinazie",
                    imageId: null,
                    tags: ["20 min"],
                  },
                ],
              }
            : results;
        }
        const found = PRODUCTS.filter((candidate) =>
          candidate.searchTerms.some((term) => term.includes(words) || words.includes(term))
        );
        return searchResults(
          tiles(found.filter((candidate) => candidate.boughtBefore)),
          tiles(found.filter((candidate) => !candidate.boughtBefore))
        );
      },
      getProduct: async (id: string) => {
        const found = byId(id);
        if (!found) throw new PicnicClient.ProductNotFoundError(id);
        const gluten = found.aisle === "BAKERY";
        return {
          id,
          name: found.name,
          brand: found.brand,
          unitQuantity: found.unitQuantity,
          unitPrice: null,
          quantityBadges: [],
          tags: [],
          displayPrice: found.displayPrice,
          originalPrice: found.originalPrice,
          priceRanges: null,
          maxCount: 50,
          imageIds: [],
          labels: [],
          description: null,
          highlightItems: [],
          allergenGroups: {
            contains: gluten
              ? [{ text: "Gluten", textColor: "#fff", backgroundColor: "#000" }]
              : [],
            mayContain: [],
          },
          infoSections: [
            {
              title: "Ingrediënten",
              content: gluten ? "Volkoren tarwemeel, water, gist, zout." : found.name,
            },
          ],
          nutritionRows: [],
          promotion: null,
          similarProducts: [],
        };
      },
      getImageUrl: (imageId: string) => `https://images.example.com/${imageId}.png`,
      getPromotions: async () => ({
        sections: [
          {
            id: "section-dairy",
            title: "Zuivel",
            products: tiles(PRODUCTS.filter((candidate) => candidate.labels.length > 0)),
            groups: [
              {
                id: "group-cheese",
                name: "Kaasplakken",
                example: "Bv. jonge kaas",
                label: "2 voor €5",
              },
            ],
          },
          { id: "section-fruit", title: "Fruit", products: tiles([byId("s1000005")!]), groups: [] },
        ],
      }),
      getPromotionGroup: async (id: string) => ({
        id,
        name: "Kaasplakken",
        products: tiles([byId("s1000010")!]),
      }),
      getFavorites: async () => {
        const aisles = [...new Set(PRODUCTS.map((candidate) => candidate.aisle))];
        return {
          aisles: aisles.map((aisle) => ({
            id: aisle,
            title: aisle.toLowerCase(),
            products: tiles(
              PRODUCTS.filter((candidate) => candidate.aisle === aisle && candidate.boughtBefore)
            ),
            complete: true,
          })),
        };
      },
      getFavoritesInAisle: async (aisle: string) =>
        tiles(PRODUCTS.filter((candidate) => candidate.aisle === aisle && candidate.boughtBefore)),
    },
    cart: {
      getCart: async () => currentCart(),
      addProductToCart: add,
      removeProductFromCart: remove,
      getReplacements: async (id: string) => ({ productId: id, reason: null, replacements: [] }),
      getDeliverySlots: async () => ({
        slots,
        selectedSlot: null,
      }),
      setDeliverySlot: async (slotId: string) => {
        if (slots.some((slot) => slot.slotId === slotId)) selectedSlotId = slotId;
        return currentCart();
      },
    },
    delivery: {
      getDeliverySummaries: async (statuses: string[]) =>
        statuses.includes("COMPLETED")
          ? [
              {
                id: "delivery-1",
                status: "COMPLETED",
                creationTime: amsterdamTime(-8, 10),
                windowStart: amsterdamTime(-7, 18),
                windowEnd: amsterdamTime(-7, 19),
                orderCount: 1,
                totalPrice: 1047,
                itemCount: 0,
              },
            ]
          : [],
      getDeliveryPosition: async () => null,
      getDelivery: async (id: string) => ({
        id,
        orders: [
          {
            id: "order-1",
            items: [
              line({ productId: "s1000004", name: "Volkoren brood", quantity: 1 }),
              line({ productId: "s1000008", name: "Toiletpapier 3-laags", quantity: 1 }),
            ],
          },
        ],
      }),
    },
    recipe: {
      getRecipe: async (id: string) => ({
        id,
        name: "Pasta pesto",
        portions: 2,
        cookingTimeMinutes: 20,
        description: null,
        note: null,
        allergens: { contains: ["Gluten", "Melk"], mayContain: [] },
        steps: ["Kook de pasta.", "Meng met de pesto."],
        ingredients: [],
      }),
      addRecipeToCart: async () => ({
        anyUnavailableIngredient: false,
        assignedNumberOfPortions: 2,
      }),
      removeRecipeFromCart: async () => ({ SURemoved: [] }),
      getSavedRecipes: async () => [],
      saveRecipe: async () => undefined,
      unsaveRecipe: async () => undefined,
    },
  };

  return {
    client: client as unknown as PicnicClient,
    /** The quantity of each product in the cart now. */
    quantities: () => Object.fromEntries([...quantities].filter(([, quantity]) => quantity > 0)),
    selectedSlotId: () => selectedSlotId,
  };
}
