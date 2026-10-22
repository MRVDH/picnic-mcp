// Made-up data in the shape of picnic-api's models. Never copy real account data in here.
import PicnicClient from "picnic-api";
import { describe, expect, it } from "vitest";

import { parseToolGroups } from "../src/tools/groups.js";
import { cart, line } from "./fixtures.js";
import { call, connect, mockPicnic } from "./helpers.js";

const ALL = ["cart", "slots", "product", "deliveries", "recipes"] as const;

function slot(id: string, start: string, end: string, overrides = {}) {
  return {
    slotId: id,
    windowStart: start,
    windowEnd: end,
    cutOffTime: "2026-10-22T22:00:00.000+02:00",
    isAvailable: true,
    isSelected: false,
    isGreenChoice: false,
    minimumOrderValue: 3500,
    ...overrides,
  };
}

describe("parseToolGroups", () => {
  it("reads a comma-separated list", () => {
    expect(parseToolGroups(" cart, Recipes ")).toEqual(["cart", "recipes"]);
  });

  it("rejects unknown and empty lists", () => {
    expect(() => parseToolGroups("cart,checkout")).toThrow(/Unknown tool group "checkout"/);
    expect(() => parseToolGroups(" , ")).toThrow(/No tool groups/);
  });
});

describe("slots", () => {
  const slots = {
    slots: [
      slot("a1", "2026-10-23T18:00:00.000+02:00", "2026-10-23T19:00:00.000+02:00"),
      slot("a2", "2026-10-23T18:00:00.000+02:00", "2026-10-23T20:00:00.000+02:00", {
        isGreenChoice: true,
        isSelected: true,
      }),
      slot("b1", "2026-10-24T08:00:00.000+02:00", "2026-10-24T09:00:00.000+02:00", {
        cutOffTime: "2026-10-23T22:00:00.000+02:00",
      }),
      slot("b2", "2026-10-24T09:00:00.000+02:00", "2026-10-24T10:00:00.000+02:00", {
        isAvailable: false,
      }),
      slot("c1", "2026-10-25T08:00:00.000+01:00", "2026-10-25T09:00:00.000+01:00"),
    ],
    selectedSlot: {
      slotId: "a2",
      state: "EXPLICIT",
      windowStart: "2026-10-23T18:00:00.000+02:00",
      windowEnd: "2026-10-23T20:00:00.000+02:00",
      isExplicitSelection: true,
    },
  };

  it("lists the first two days, sharing the deadline and minimum per day", async () => {
    const picnic = mockPicnic();
    picnic.cart.getDeliverySlots.mockResolvedValue(slots);
    await connect(picnic);

    const result = (await call("get_delivery_slots")).json();
    expect(result).toEqual({
      selectedWindow: "Fri 23 Oct, 18:00-20:00",
      days: [
        {
          date: "2026-10-23",
          day: "Fri 23 Oct",
          orderBefore: "Thu 22 Oct, 22:00",
          minimumOrder: "€ 35,00",
          slots: [
            { slotId: "a1", time: "18:00-19:00" },
            { slotId: "a2", time: "18:00-20:00", greenChoice: true, selected: true },
          ],
        },
        {
          date: "2026-10-24",
          day: "Sat 24 Oct",
          orderBefore: "Fri 23 Oct, 22:00",
          minimumOrder: "€ 35,00",
          slots: [{ slotId: "b1", time: "08:00-09:00" }],
        },
      ],
      otherDays: ["2026-10-25 (Sun 25 Oct)"],
    });
  });

  it("lists one day by date, and says when it has no slots", async () => {
    const picnic = mockPicnic();
    picnic.cart.getDeliverySlots.mockResolvedValue(slots);
    await connect(picnic);

    const day = (await call("get_delivery_slots", { date: "2026-10-25" })).json();
    expect(day.days.map((d: { date: string }) => d.date)).toEqual(["2026-10-25"]);
    const empty = (await call("get_delivery_slots", { date: "2026-11-01" })).json();
    expect(empty.next).toMatch(/No slots on 2026-11-01/);
    expect(empty.otherDays).toHaveLength(3);
  });

  it("selects a slot and checks Picnic selected it", async () => {
    const picnic = mockPicnic();
    picnic.cart.setDeliverySlot.mockResolvedValue(
      cart([line({ productId: "s1" })], { selectedSlot: slots.selectedSlot })
    );
    await connect(picnic);

    const result = (await call("select_delivery_slot", { slotId: "a2" })).json();
    expect(picnic.cart.setDeliverySlot).toHaveBeenCalledWith("a2");
    expect(result.cart.deliveryWindow).toBe("Fri 23 Oct, 18:00-20:00");
    expect((await call("select_delivery_slot", { slotId: "zz" })).isError).toBe(true);
  });
});

describe("product", () => {
  it("returns the details without images, colors or similar products", async () => {
    const picnic = mockPicnic();
    picnic.catalog.getProduct.mockResolvedValue({
      id: "s1",
      name: "Melk",
      brand: "Merk",
      unitQuantity: "1 liter",
      unitPrice: "€1,49/l",
      quantityBadges: [{ text: "XL", textColor: "#fff", backgroundColor: "#000" }],
      tags: [{ text: "Gekoeld", color: null }],
      displayPrice: 149,
      originalPrice: 199,
      displayPriceColor: "RED2",
      priceRanges: null,
      maxCount: 50,
      imageIds: ["image-id"],
      labels: [],
      description: "Verse melk.",
      highlightItems: [],
      allergenGroups: {
        contains: [{ text: "Melk", textColor: "#fff", backgroundColor: "#000" }],
        mayContain: [],
      },
      infoSections: [{ title: "Ingrediënten", content: "Melk" }],
      nutritionRows: [
        { label: "Per 100 g", value: null, isCategory: true, backgroundColor: null },
        { label: "Vet", value: "1,5g", isCategory: true, backgroundColor: "#eee" },
      ],
      promotion: { id: "p1", label: "25% korting" },
      similarProducts: [{ id: "s9", name: "Andere melk" }],
    });
    await connect(picnic);

    const { text, json } = await call("get_product", { productId: "s1" });
    expect(json()).toEqual({
      id: "s1",
      name: "Melk",
      brand: "Merk",
      size: "1 liter",
      price: "€ 1,49",
      wasPrice: "€ 1,99",
      unitPrice: "€1,49/l",
      promotion: "25% korting",
      labels: ["XL", "Gekoeld"],
      description: "Verse melk.",
      allergens: { contains: ["Melk"], mayContain: [] },
      nutrition: ["Per 100 g", "Vet: 1,5g"],
      info: [{ title: "Ingrediënten", content: "Melk" }],
    });
    expect(text).not.toMatch(/image-id|#fff|s9|RED2/);
  });

  it("leaves out a zero price and the info section that repeats the nutrition table", async () => {
    const picnic = mockPicnic();
    picnic.catalog.getProduct.mockResolvedValue({
      id: "s1",
      name: "Toiletpapier",
      brand: null,
      unitQuantity: "9 rollen",
      unitPrice: null,
      quantityBadges: [],
      tags: [],
      displayPrice: 0,
      originalPrice: 299,
      priceRanges: null,
      labels: [],
      description: null,
      allergenGroups: { contains: [], mayContain: [] },
      infoSections: [
        { title: "Voedingswaarde", content: "Per 100 g\nVet\n1,5g\n" },
        { title: "Extra informatie", content: "Droog bewaren" },
      ],
      nutritionRows: [
        { label: "Per 100 g", value: null, isCategory: true, backgroundColor: null },
        { label: "Vet", value: "1,5g", isCategory: true, backgroundColor: null },
      ],
      promotion: null,
    });
    await connect(picnic);

    const result = (await call("get_product", { productId: "s1" })).json();
    expect(result.price).toBeUndefined();
    expect(result.wasPrice).toBeUndefined();
    expect(result.info).toEqual([{ title: "Extra informatie", content: "Droog bewaren" }]);
  });

  it("says when a product doesn't exist", async () => {
    const picnic = mockPicnic();
    picnic.catalog.getProduct.mockRejectedValue(new PicnicClient.ProductNotFoundError("s1"));
    await connect(picnic);

    const result = await call("get_product", { productId: "s1" });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/s1 doesn't exist/);
  });
});

describe("deliveries", () => {
  const summary = (id: string, start: string) => ({
    id,
    status: "CURRENT",
    creationTime: "2026-10-20T10:00:00.000+02:00",
    windowStart: start,
    windowEnd: start.replace("T18", "T19"),
    orderCount: 1,
    totalPrice: 5000,
    itemCount: 12,
  });

  it("lists upcoming deliveries soonest first, without ids, payment, driver or address", async () => {
    const picnic = mockPicnic();
    picnic.delivery.getDeliverySummaries.mockResolvedValue([
      summary("delivery-2", "2026-10-25T18:00:00.000+01:00"),
      summary("delivery-1", "2026-10-23T18:00:00.000+02:00"),
    ]);
    picnic.delivery.getDeliveryPosition.mockImplementation(async (id: string) => {
      if (id === "delivery-2") throw new Error("no position yet");
      return {
        routeVersion: 1,
        inProgress: true,
        queryInterval: 30000,
        eta: null,
        etaWindowStart: "2026-10-23T18:12:00.000+02:00",
        etaWindowEnd: "2026-10-23T18:32:00.000+02:00",
        routeTime: 0,
      };
    });
    picnic.delivery.getDelivery.mockResolvedValue({
      id: "delivery-1",
      orders: [
        {
          id: "order-1",
          items: [line({ productId: "s1" })],
          payment: { paymentType: "IDEAL", redactedIban: "NL00XXXX0000", bankId: "BANKNL2A" },
        },
      ],
    });
    await connect(picnic, { tools: ["deliveries"] });

    const { text, json } = await call("get_deliveries", { includeProducts: true });
    expect(picnic.delivery.getDeliverySummaries).toHaveBeenCalledWith(["CURRENT"]);
    expect(json().deliveries).toEqual([
      {
        window: "Fri 23 Oct, 18:00-19:00",
        itemCount: 12,
        total: "€ 50,00",
        onTheWay: true,
        expectedArrival: "18:12-18:32",
        products: [expect.objectContaining({ productId: "s1" })],
      },
      expect.objectContaining({ window: "Sun 25 Oct, 18:00-19:00" }),
    ]);
    expect(text).not.toMatch(/delivery-\d|order-1|IDEAL|NL00|BANKNL/);
  });

  it("says when there are no upcoming deliveries", async () => {
    const picnic = mockPicnic();
    picnic.delivery.getDeliverySummaries.mockResolvedValue([]);
    await connect(picnic, { tools: ["deliveries"] });

    expect((await call("get_deliveries")).json().next).toMatch(/no upcoming deliveries/);
    expect(picnic.delivery.getDeliveryPosition).not.toHaveBeenCalled();
  });
});

describe("recipes", () => {
  it("searches recipes in the meals context", async () => {
    const picnic = mockPicnic();
    picnic.catalog.getSearchResults.mockResolvedValue({
      query: "pasta",
      correctedQuery: null,
      products: null,
      recipes: [{ id: "r1", name: "Pasta", subtitle: null, imageId: "image-id", tags: ["15 min"] }],
    });
    await connect(picnic, { tools: ["recipes"] });

    const result = (await call("search_recipes", { query: "pasta" })).json();
    expect(picnic.catalog.getSearchResults).toHaveBeenCalledWith("pasta", { context: "MEALS" });
    expect(result.recipes).toEqual([{ recipeId: "r1", name: "Pasta", tags: ["15 min"] }]);
  });

  it("returns a recipe without the user's note", async () => {
    const picnic = mockPicnic();
    picnic.recipe.getRecipe.mockResolvedValue({
      id: "r1",
      name: "Pasta",
      portions: 2,
      cookingTimeMinutes: 20,
      description: null,
      note: "<p>Mijn eigen notitie</p>",
      allergens: { contains: ["Gluten"], mayContain: [] },
      steps: ["Kook de pasta."],
      ingredients: [
        {
          name: "Pasta",
          sellingUnitId: "s1",
          quantity: 1,
          neededText: "(200 g nodig)",
          price: 129,
          checked: true,
          type: "CORE",
          isAvailable: true,
          unavailableReason: null,
        },
        {
          name: "Olijfolie",
          sellingUnitId: "s2",
          quantity: 1,
          neededText: null,
          price: null,
          checked: false,
          type: "CUPBOARD",
          isAvailable: false,
          unavailableReason: "Uitverkocht",
        },
      ],
    });
    await connect(picnic, { tools: ["recipes"] });

    const { text, json } = await call("get_recipe", { recipeId: "r1", portions: 2 });
    expect(picnic.recipe.getRecipe).toHaveBeenCalledWith("r1", { portions: 2 });
    expect(json().ingredients).toEqual([
      {
        name: "Pasta",
        productId: "s1",
        quantity: 1,
        needed: "(200 g nodig)",
        price: "€ 1,29",
        added: true,
      },
      {
        name: "Olijfolie",
        productId: "s2",
        quantity: 1,
        added: false,
        cupboard: true,
        unavailable: "Uitverkocht",
      },
    ]);
    expect(text).not.toMatch(/notitie/);
  });

  it("adds and removes a recipe, returning the cart totals", async () => {
    const picnic = mockPicnic();
    picnic.recipe.addRecipeToCart.mockResolvedValue({
      anyUnavailableIngredient: true,
      assignedNumberOfPortions: 4,
      cart: {},
    });
    picnic.recipe.removeRecipeFromCart.mockResolvedValue({
      cart: {},
      selectedSellableComponentIds: [],
      SURemoved: [
        { quantity: 2, selling_unit_id: "s1" },
        { quantity: 1, selling_unit_id: "s2" },
      ],
    });
    picnic.cart.getCart.mockResolvedValue(
      cart([line({ productId: "s1", recipeId: "r1" })], {
        recipes: [{ id: "r1", title: "Pasta", preTitle: null, subtitle: null, imageId: null }],
      })
    );
    await connect(picnic, { tools: ["recipes"] });

    const added = (await call("add_recipe_to_cart", { recipeId: "r1", portions: 4 })).json();
    expect(picnic.recipe.addRecipeToCart).toHaveBeenCalledWith("r1", { portions: 4 });
    expect(added.added).toEqual({ recipeId: "r1", name: "Pasta", portions: 4 });
    expect(added.next).toMatch(/can't be delivered/);

    const removed = (await call("remove_recipe_from_cart", { recipeId: "r1" })).json();
    expect(removed.removed).toEqual({ recipeId: "r1", productsRemoved: 3 });
    expect(removed.cart.itemCount).toBe(1);
  });
});

describe("all groups", () => {
  it("registers 12 tools", async () => {
    const client = await connect(mockPicnic(), { tools: [...ALL] });
    expect((await client.listTools()).tools).toHaveLength(12);
  });
});
