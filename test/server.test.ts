import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import PicnicClient from "picnic-api";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createServer } from "../src/index.js";
import { cart, line, searchResults, tile } from "./fixtures.js";

function mockPicnic() {
  return {
    catalog: { getSearchResults: vi.fn() },
    cart: {
      getCart: vi.fn(),
      addProductToCart: vi.fn(),
      removeProductFromCart: vi.fn(),
    },
  };
}

let client: Client;

async function connect(picnic: ReturnType<typeof mockPicnic>, onError = vi.fn()) {
  const server = createServer({ client: picnic as unknown as PicnicClient, onError });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientTransport);
  return client;
}

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[])[0].text;
  return { isError: result.isError ?? false, text, json: () => JSON.parse(text) };
}

afterEach(async () => {
  await client?.close();
});

describe("createServer", () => {
  it("lists the four tools, with the read-only ones marked", async () => {
    await connect(mockPicnic());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "add_to_cart",
      "get_cart",
      "remove_from_cart",
      "search_products",
    ]);
    const readOnly = tools.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name);
    expect(readOnly.sort()).toEqual(["get_cart", "search_products"]);
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
      id: "s1",
      name: "Toiletpapier",
      brand: "Merk",
      size: "1 stuk",
      price: "€ 4,49",
      boughtBefore: true,
    });
    expect(result.otherResults).toEqual([
      expect.objectContaining({ id: "s2", labels: ["1+1 gratis"] }),
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
    expect(result.choices.map((p: { id: string }) => p.id)).toEqual(["s1", "s2"]);
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

    const result = (await call("add_to_cart", { productId: "s1", quantity: 2 })).json();
    expect(picnic.cart.addProductToCart).toHaveBeenCalledWith("s1", 2);
    expect(result.added).toEqual({ productId: "s1", name: "Product s1", quantityInCart: 3 });
    expect(result.cart.itemCount).toBe(3);
  });

  it("reports a product that wasn't added", async () => {
    const picnic = mockPicnic();
    picnic.cart.addProductToCart.mockResolvedValue(cart([]));
    await connect(picnic);

    const result = await call("add_to_cart", { productId: "s9" });
    expect(result.isError).toBe(true);
    expect(picnic.cart.addProductToCart).toHaveBeenCalledWith("s9", 1);
  });

  it("rejects something that isn't a product id without calling Picnic", async () => {
    const picnic = mockPicnic();
    await connect(picnic);

    const result = await call("add_to_cart", { productId: "toiletpapier" });
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
    await connect(picnic, onError);

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
