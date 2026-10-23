// Made-up data in the shape of picnic-api's models. Never copy real account data in here.
import PicnicClient from "picnic-api";
import { describe, expect, it } from "vitest";

import { cart, line } from "./fixtures.js";
import { call, connect, mockPicnic } from "./helpers.js";

describe("add_to_cart with several products", () => {
  it("adds each product in order and returns them with the final cart", async () => {
    const picnic = mockPicnic();
    picnic.cart.addProductToCart
      .mockResolvedValueOnce(cart([line({ productId: "s1" })]))
      .mockResolvedValueOnce(
        cart([line({ productId: "s1" }), line({ productId: "s2", quantity: 3 })])
      );
    await connect(picnic);

    const result = (
      await call("add_to_cart", {
        items: [{ productId: "s1" }, { productId: "s2", quantity: 3 }],
      })
    ).json();
    expect(picnic.cart.addProductToCart.mock.calls).toEqual([
      ["s1", 1],
      ["s2", 3],
    ]);
    expect(result.added).toEqual([
      { productId: "s1", name: "Product s1", quantityInCart: 1 },
      { productId: "s2", name: "Product s2", quantityInCart: 3 },
    ]);
    expect(result.cart.itemCount).toBe(4);
    expect(result.next).toBeUndefined();
  });

  it("says when a product was in the cart already, pointing to set_cart_quantity", async () => {
    const picnic = mockPicnic();
    picnic.cart.addProductToCart.mockResolvedValue(cart([line({ productId: "s1", quantity: 5 })]));
    await connect(picnic);

    const result = (
      await call("add_to_cart", { items: [{ productId: "s1", quantity: 4 }] })
    ).json();
    expect(result.added[0].quantityInCart).toBe(5);
    expect(result.next).toMatch(/in the cart already.*set_cart_quantity/);
  });

  it("continues after a product Picnic refused, and lists it as failed", async () => {
    const picnic = mockPicnic();
    picnic.cart.addProductToCart
      .mockRejectedValueOnce(new PicnicClient.PicnicApiError(400, "Bad Request", "{}"))
      .mockResolvedValueOnce(cart([line({ productId: "s2" })]));
    await connect(picnic);

    const result = (
      await call("add_to_cart", { items: [{ productId: "s1" }, { productId: "s2" }] })
    ).json();
    expect(result.added.map((item: { productId: string }) => item.productId)).toEqual(["s2"]);
    expect(result.failed).toEqual([{ productId: "s1", error: expect.stringMatching(/HTTP 400/) }]);
    expect(result.next).toMatch(/failed/);
  });

  it("stops at an error that would hit every product", async () => {
    const picnic = mockPicnic();
    picnic.cart.addProductToCart
      .mockResolvedValueOnce(cart([line({ productId: "s1" })]))
      .mockRejectedValueOnce(new PicnicClient.PicnicApiError(401, "Unauthorized", "{}"));
    await connect(picnic);

    const result = (
      await call("add_to_cart", {
        items: [{ productId: "s1" }, { productId: "s2" }, { productId: "s3" }],
      })
    ).json();
    expect(picnic.cart.addProductToCart).toHaveBeenCalledTimes(2);
    expect(result.added.map((item: { productId: string }) => item.productId)).toEqual(["s1"]);
    expect(result.failed).toEqual([
      { productId: "s2", error: expect.stringMatching(/auth key/) },
      { productId: "s3", error: "Not tried after the error above." },
    ]);
  });

  it("returns an error when nothing was added", async () => {
    const picnic = mockPicnic();
    picnic.cart.addProductToCart.mockRejectedValue(
      new PicnicClient.PicnicApiError(502, "Bad Gateway", "{}")
    );
    await connect(picnic);

    const result = await call("add_to_cart", { items: [{ productId: "s1" }] });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/s1: .*check get_cart before trying again/);
  });

  it("rejects an empty list and more than 20 products without calling Picnic", async () => {
    const picnic = mockPicnic();
    await connect(picnic);

    expect((await call("add_to_cart", { items: [] })).isError).toBe(true);
    const many = Array.from({ length: 21 }, (_, index) => ({ productId: `s${index + 1}` }));
    expect((await call("add_to_cart", { items: many })).isError).toBe(true);
    expect(picnic.cart.addProductToCart).not.toHaveBeenCalled();
  });
});

describe("set_cart_quantity", () => {
  it("adds the difference when the quantity goes up", async () => {
    const picnic = mockPicnic();
    picnic.cart.getCart.mockResolvedValue(cart([line({ productId: "s1", quantity: 1 })]));
    picnic.cart.addProductToCart.mockResolvedValue(cart([line({ productId: "s1", quantity: 3 })]));
    await connect(picnic);

    const result = (await call("set_cart_quantity", { productId: "s1", quantity: 3 })).json();
    expect(picnic.cart.addProductToCart).toHaveBeenCalledWith("s1", 2);
    expect(picnic.cart.removeProductFromCart).not.toHaveBeenCalled();
    expect(result.product).toEqual({ productId: "s1", name: "Product s1", quantityInCart: 3 });
  });

  it("removes the difference when the quantity goes down, also to 0", async () => {
    const picnic = mockPicnic();
    picnic.cart.getCart.mockResolvedValue(cart([line({ productId: "s1", quantity: 4 })]));
    picnic.cart.removeProductFromCart.mockResolvedValue(cart([]));
    await connect(picnic);

    const result = (await call("set_cart_quantity", { productId: "s1", quantity: 0 })).json();
    expect(picnic.cart.removeProductFromCart).toHaveBeenCalledWith("s1", 4);
    expect(result.product).toEqual({ productId: "s1", quantityInCart: 0 });
  });

  it("changes nothing when the quantity is already right", async () => {
    const picnic = mockPicnic();
    picnic.cart.getCart.mockResolvedValue(cart([line({ productId: "s1", quantity: 2 })]));
    await connect(picnic);

    const result = (await call("set_cart_quantity", { productId: "s1", quantity: 2 })).json();
    expect(picnic.cart.addProductToCart).not.toHaveBeenCalled();
    expect(picnic.cart.removeProductFromCart).not.toHaveBeenCalled();
    expect(result.product.quantityInCart).toBe(2);
  });
});
