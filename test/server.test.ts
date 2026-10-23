import PicnicClient from "picnic-api";
import { describe, expect, it, vi } from "vitest";

import { cart, line, searchResults, tile } from "./fixtures.js";
import { call, connect, mockPicnic } from "./helpers.js";

/** A cart line that can't be delivered, with the placeholder replacements the cart response has. */
function unavailableLine(productId: string) {
  return line({
    productId,
    isUnavailable: true,
    unavailableReason: "Niet leverbaar op dit moment",
    replacements: ["s2", "s3"].map((id) => ({
      id,
      name: "irrelevant",
      imageId: "image-id",
      displayPrice: 0,
      unitQuantity: "",
      maxCount: 99,
    })),
  });
}

/** What cart.getReplacements returns for a product: four replacements, one unavailable. */
function replacementsOf(productId: string) {
  return {
    productId,
    reason: "TEMPORARILY_UNAVAILABLE",
    replacements: [
      tile({ id: "s2", name: "Vervanger 1", displayPrice: 219, unitQuantity: "500 gram" }),
      tile({ id: "s3", name: "Vervanger 2", isUnavailable: true }),
      tile({ id: "s4", name: "Vervanger 3", displayPrice: 179, originalPrice: 199 }),
      tile({ id: "s5", name: "Vervanger 4" }),
      tile({ id: "s6", name: "Vervanger 5" }),
    ],
  };
}

describe("createServer", () => {
  it("lists the default tools, with the read-only ones marked", async () => {
    const client = await connect(mockPicnic());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "add_to_cart",
      "get_cart",
      "get_delivery_slots",
      "get_favorites",
      "get_product",
      "get_promotions",
      "remove_from_cart",
      "search_products",
      "select_delivery_slot",
      "set_cart_quantity",
    ]);
    const readOnly = tools.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name);
    expect(readOnly.sort()).toEqual([
      "get_cart",
      "get_delivery_slots",
      "get_favorites",
      "get_product",
      "get_promotions",
      "search_products",
    ]);
  });

  it("lists only the tools of the groups that are turned on", async () => {
    const client = await connect(mockPicnic(), { tools: ["deliveries", "recipes"] });
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "add_recipe_to_cart",
      "get_deliveries",
      "get_recipe",
      "get_saved_recipes",
      "remove_recipe_from_cart",
      "save_recipe",
      "search_recipes",
      "unsave_recipe",
    ]);
  });

  it("returns the best match with a short product", async () => {
    const picnic = mockPicnic();
    picnic.catalog.getSearchResults.mockResolvedValue(
      searchResults(
        [tile({ id: "s1", name: "Toiletpapier", numberOfOrders: 6, displayPrice: 449 })],
        [tile({ id: "s2", labels: [{ position: "topLeft", type: "PROMO", text: "1+1 gratis" }] })]
      )
    );
    await connect(picnic);

    const result = (await call("search_products", { query: "toiletpapier" })).json();
    expect(picnic.catalog.getSearchResults).toHaveBeenCalledWith("toiletpapier");
    expect(result.bestMatch).toEqual({
      productId: "s1",
      name: "Toiletpapier",
      brand: "Merk",
      size: "1 stuk",
      price: "€ 4,49",
      boughtBefore: true,
    });
    expect(result.otherResults).toEqual([
      expect.objectContaining({ productId: "s2", labels: ["1+1 gratis"] }),
    ]);
    expect(result.choices).toBeUndefined();
  });

  it("returns choices when there is no clear match", async () => {
    const picnic = mockPicnic();
    picnic.catalog.getSearchResults.mockResolvedValue(
      searchResults([], [tile({ id: "s1" }), tile({ id: "s2" })], "melk")
    );
    await connect(picnic);

    const result = (await call("search_products", { query: "mlek" })).json();
    expect(result.searchedFor).toBe("melk");
    expect(result.choices.map((p: { productId: string }) => p.productId)).toEqual(["s1", "s2"]);
    expect(result.bestMatch).toBeUndefined();
    expect(result.next).toMatch(/ask the user/i);
  });

  it("shows the cart without its id or images", async () => {
    const picnic = mockPicnic();
    picnic.cart.getCart.mockResolvedValue(
      cart([line({ productId: "s1", quantity: 2, displayPrice: 398 })], {
        minimumOrderValue: 3500,
        selectedSlot: {
          slotId: "slot-id",
          state: "EXPLICIT",
          windowStart: "2026-10-22T18:00:00.000+02:00",
          windowEnd: "2026-10-22T19:00:00.000+02:00",
          isExplicitSelection: true,
        },
      })
    );
    await connect(picnic);

    const { text, json } = await call("get_cart");
    expect(json()).toEqual({
      items: [
        { productId: "s1", name: "Product s1", size: "1 stuk", quantity: 2, price: "€ 3,98" },
      ],
      itemCount: 2,
      total: "€ 3,98",
      deliveryWindow: "Thu 22 Oct, 18:00-19:00",
      minimumOrder: "€ 35,00",
    });
    expect(text).not.toMatch(/cart-id|image-id|slot-id|line-s1/);
  });

  it("adds a product and returns the quantity in the cart", async () => {
    const picnic = mockPicnic();
    picnic.cart.addProductToCart.mockResolvedValue(
      cart([line({ productId: "s1", quantity: 2 }), line({ productId: "s1", recipeId: "r1" })])
    );
    await connect(picnic);

    const result = (
      await call("add_to_cart", { items: [{ productId: "s1", quantity: 2 }] })
    ).json();
    expect(picnic.cart.addProductToCart).toHaveBeenCalledWith("s1", 2);
    expect(result.added).toEqual([{ productId: "s1", name: "Product s1", quantityInCart: 3 }]);
    expect(result.cart.itemCount).toBe(3);
  });

  it("lists why a cart line can't be delivered and the replacements from Picnic's page", async () => {
    const picnic = mockPicnic();
    picnic.cart.getCart.mockResolvedValue(cart([unavailableLine("s1"), line({ productId: "s9" })]));
    picnic.cart.getReplacements.mockImplementation(async (id: string) => replacementsOf(id));
    await connect(picnic);

    const { text, json } = await call("get_cart");
    expect(picnic.cart.getReplacements).toHaveBeenCalledTimes(1);
    expect(picnic.cart.getReplacements).toHaveBeenCalledWith("s1");
    expect(json().items[0]).toMatchObject({
      productId: "s1",
      unavailable: "Niet leverbaar op dit moment",
      replacements: [
        { productId: "s2", name: "Vervanger 1", size: "500 gram", price: "€ 2,19" },
        { productId: "s4", name: "Vervanger 3", price: "€ 1,79", wasPrice: "€ 1,99" },
        { productId: "s5", name: "Vervanger 4" },
      ],
    });
    expect(json().items[0].price).toBeUndefined();
    expect(json().items[1].replacements).toBeUndefined();
    expect(text).not.toMatch(/irrelevant|image-id|s6/);
  });

  it("keeps the reason when the replacements can't be read", async () => {
    const picnic = mockPicnic();
    picnic.cart.getCart.mockResolvedValue(cart([unavailableLine("s1")]));
    picnic.cart.getReplacements.mockRejectedValue(new Error("page failed"));
    const onError = vi.fn();
    await connect(picnic, { onError });

    const item = (await call("get_cart")).json().items[0];
    expect(item.unavailable).toBe("Niet leverbaar op dit moment");
    expect(item.replacements).toBeUndefined();
    expect(onError).toHaveBeenCalled();
  });

  it("says when an added product can't be delivered", async () => {
    const picnic = mockPicnic();
    picnic.cart.addProductToCart.mockResolvedValue(cart([unavailableLine("s1")]));
    picnic.cart.getReplacements.mockImplementation(async (id: string) => replacementsOf(id));
    await connect(picnic);

    const result = (await call("add_to_cart", { items: [{ productId: "s1" }] })).json();
    expect(result.next).toMatch(/can't be delivered/);
    expect(result.added[0]).toMatchObject({
      productId: "s1",
      quantityInCart: 1,
      unavailable: "Niet leverbaar op dit moment",
    });
    expect(result.added[0].replacements.map((p: { productId: string }) => p.productId)).toEqual([
      "s2",
      "s4",
      "s5",
    ]);
  });

  it("adds no hint when the added product can be delivered", async () => {
    const picnic = mockPicnic();
    picnic.cart.addProductToCart.mockResolvedValue(cart([line({ productId: "s1" })]));
    await connect(picnic);

    const result = (await call("add_to_cart", { items: [{ productId: "s1" }] })).json();
    expect(result.next).toBeUndefined();
    expect(result.added).toEqual([{ productId: "s1", name: "Product s1", quantityInCart: 1 }]);
    expect(result.failed).toBeUndefined();
  });

  it("reports a product that wasn't added", async () => {
    const picnic = mockPicnic();
    picnic.cart.addProductToCart.mockResolvedValue(cart([]));
    await connect(picnic);

    const result = await call("add_to_cart", { items: [{ productId: "s9" }] });
    expect(result.isError).toBe(true);
    expect(picnic.cart.addProductToCart).toHaveBeenCalledWith("s9", 1);
  });

  it("rejects something that isn't a product id without calling Picnic", async () => {
    const picnic = mockPicnic();
    await connect(picnic);

    const result = await call("add_to_cart", { items: [{ productId: "toiletpapier" }] });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/search_products/);
    expect(picnic.cart.addProductToCart).not.toHaveBeenCalled();
  });

  it("removes a product and returns what is left", async () => {
    const picnic = mockPicnic();
    picnic.cart.removeProductFromCart.mockResolvedValue(cart([]));
    await connect(picnic);

    const result = (await call("remove_from_cart", { productId: "s1" })).json();
    expect(picnic.cart.removeProductFromCart).toHaveBeenCalledWith("s1", 1);
    expect(result.removed).toEqual({ productId: "s1", quantityInCart: 0 });
  });

  it("turns an expired auth key into a short error without the response body", async () => {
    const picnic = mockPicnic();
    picnic.cart.getCart.mockRejectedValue(
      new PicnicClient.PicnicApiError(401, "Unauthorized", '{"error":{"code":"AUTH_ERROR"}}')
    );
    const onError = vi.fn();
    await connect(picnic, { onError });

    const result = await call("get_cart");
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/auth key is invalid or expired/);
    expect(result.text).not.toMatch(/AUTH_ERROR/);
    expect(onError).toHaveBeenCalled();
  });

  it("recognises throttling by its HTML body", async () => {
    const picnic = mockPicnic();
    picnic.catalog.getSearchResults.mockRejectedValue(
      new PicnicClient.PicnicApiError(403, "Forbidden", "<html><body>403</body></html>")
    );
    await connect(picnic);

    expect((await call("search_products", { query: "melk" })).text).toMatch(/rate limiting/);
  });
});

describe("product images", () => {
  it("puts the image URLs of the listed products in _meta, not in the text", async () => {
    const picnic = mockPicnic();
    picnic.catalog.getSearchResults.mockResolvedValue(
      searchResults(
        [],
        [
          tile({ id: "s1", imageId: "img-1" }),
          tile({ id: "s2", imageId: null }),
          tile({ id: "s3", imageId: "img-3" }),
        ]
      )
    );
    await connect(picnic);

    const result = await call("search_products", { query: "melk" });
    expect(result.images()).toEqual({
      s1: "https://images.example.com/img-1.png",
      s3: "https://images.example.com/img-3.png",
    });
    expect(picnic.catalog.getImageUrl).toHaveBeenCalledWith("img-1", "large");
    expect(result.text).not.toMatch(/example\.com|img-/);
  });

  it("gives the images of the cart lines and their replacements", async () => {
    const picnic = mockPicnic();
    picnic.cart.getCart.mockResolvedValue(
      cart([
        line({ productId: "s9", imageId: "img-9" }),
        { ...unavailableLine("s1"), imageId: "img-1" },
      ])
    );
    picnic.cart.getReplacements.mockImplementation(async (id: string) => replacementsOf(id));
    await connect(picnic);

    expect((await call("get_cart")).images()).toEqual({
      s9: "https://images.example.com/img-9.png",
      s1: "https://images.example.com/img-1.png",
      s2: "https://images.example.com/image-id.png",
      s4: "https://images.example.com/image-id.png",
      s5: "https://images.example.com/image-id.png",
    });
  });

  it("gives the image of an added product", async () => {
    const picnic = mockPicnic();
    picnic.cart.addProductToCart.mockResolvedValue(
      cart([line({ productId: "s1", imageId: "img-1" })])
    );
    await connect(picnic);

    expect((await call("add_to_cart", { items: [{ productId: "s1" }] })).images()).toEqual({
      s1: "https://images.example.com/img-1.png",
    });
  });
});
