// Made-up data in the shape of picnic-api's models. Never copy real account data in here.
import { describe, expect, it } from "vitest";

import { tile } from "./fixtures.js";
import { call, connect, mockPicnic } from "./helpers.js";

const promoLabel = (text: string) => [{ position: "bottomLeft", type: "PROMO", text }];

function promotions() {
  return {
    sections: [
      {
        id: "section-1",
        title: "Zuivel",
        products: [
          tile({
            id: "s1",
            name: "Yoghurt",
            labels: promoLabel("20% korting"),
            originalPrice: 249,
          }),
          tile({ id: "s2", name: "Kwark" }),
          tile({ id: "s3", name: "Melk" }),
        ],
        groups: [
          {
            id: "group-1",
            name: "Plantaardige yoghurt",
            example: "Bv. sojayoghurt",
            label: "2 voor €3.99",
          },
          { id: "group-2", name: "Kaas", example: null, label: null },
          { id: "group-3", name: "Boter", example: null, label: "1+1 gratis" },
          { id: "group-4", name: "Eieren", example: null, label: null },
        ],
      },
      {
        id: "section-2",
        title: "Fruit",
        products: [tile({ id: "s4", name: "Appels" })],
        groups: [],
      },
    ],
  };
}

describe("get_promotions", () => {
  it("lists the sections with a few products and promotions each", async () => {
    const picnic = mockPicnic();
    picnic.catalog.getPromotions.mockResolvedValue(promotions());
    await connect(picnic);

    const result = await call("get_promotions");
    const { sections, next } = result.json();
    expect(next).toMatch(/with its title/);
    expect(sections[0]).toEqual({
      title: "Zuivel",
      products: [
        expect.objectContaining({ productId: "s1", labels: ["20% korting"], wasPrice: "€ 2,49" }),
        expect.objectContaining({ productId: "s2" }),
      ],
      promotions: [
        {
          promotionId: "group-1",
          name: "Plantaardige yoghurt",
          example: "Bv. sojayoghurt",
          label: "2 voor €3.99",
        },
        { promotionId: "group-2", name: "Kaas" },
        { promotionId: "group-3", name: "Boter", label: "1+1 gratis" },
      ],
      more: 2,
    });
    expect(sections[1]).toMatchObject({ title: "Fruit", more: 0 });
    expect(Object.keys(result.images() as object)).toEqual(["s1", "s2", "s4"]);
  });

  it("lists all products and promotions of a section, matching its title in any case", async () => {
    const picnic = mockPicnic();
    picnic.catalog.getPromotions.mockResolvedValue(promotions());
    await connect(picnic);

    const result = (await call("get_promotions", { section: "zuivel" })).json();
    expect(result.section).toBe("Zuivel");
    expect(result.products.map((p: { productId: string }) => p.productId)).toEqual([
      "s1",
      "s2",
      "s3",
    ]);
    expect(result.promotions).toHaveLength(4);
  });

  it("says which sections exist when the title doesn't match", async () => {
    const picnic = mockPicnic();
    picnic.catalog.getPromotions.mockResolvedValue(promotions());
    await connect(picnic);

    const result = await call("get_promotions", { section: "Snoep" });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/Zuivel, Fruit/);
  });

  it("lists the products of one promotion", async () => {
    const picnic = mockPicnic();
    picnic.catalog.getPromotionGroup.mockResolvedValue({
      id: "group-1",
      name: "Plantaardige yoghurt",
      products: [tile({ id: "s5", name: "Sojayoghurt" })],
    });
    await connect(picnic);

    const result = (await call("get_promotions", { promotionId: "group-1" })).json();
    expect(picnic.catalog.getPromotionGroup).toHaveBeenCalledWith("group-1");
    expect(picnic.catalog.getPromotions).not.toHaveBeenCalled();
    expect(result).toEqual({
      promotion: "Plantaardige yoghurt",
      products: [expect.objectContaining({ productId: "s5", name: "Sojayoghurt" })],
    });
  });
});

describe("get_favorites", () => {
  it("lists the aisles with their first products, and the aisles that load later", async () => {
    const picnic = mockPicnic();
    const dairy = Array.from({ length: 7 }, (_, index) => tile({ id: `s${index + 1}` }));
    picnic.catalog.getFavorites.mockResolvedValue({
      aisles: [
        {
          id: "FRUIT",
          title: "Fruit",
          products: [tile({ id: "s20", name: "Appels" })],
          complete: true,
        },
        { id: "DAIRY", title: "Zuivel & eieren", products: dairy, complete: true },
        { id: "PET", title: "Dier", products: [], complete: false },
      ],
    });
    await connect(picnic);

    const result = (await call("get_favorites")).json();
    expect(result.aisles).toEqual([
      {
        aisleId: "FRUIT",
        name: "Fruit",
        products: [expect.objectContaining({ productId: "s20" })],
      },
      { aisleId: "DAIRY", name: "Zuivel & eieren", products: expect.any(Array), more: true },
    ]);
    expect(result.aisles[1].products).toHaveLength(5);
    expect(result.otherAisles).toEqual([{ aisleId: "PET", name: "Dier" }]);
    expect(result.aisles[0].products[0].boughtBefore).toBeUndefined();
  });

  it("lists all favorites of an aisle", async () => {
    const picnic = mockPicnic();
    picnic.catalog.getFavoritesInAisle.mockResolvedValue([tile({ id: "s1" }), tile({ id: "s2" })]);
    await connect(picnic);

    const result = (await call("get_favorites", { aisleId: "dairy" })).json();
    expect(picnic.catalog.getFavoritesInAisle).toHaveBeenCalledWith("DAIRY");
    expect(result.aisleId).toBe("DAIRY");
    expect(result.products).toHaveLength(2);
  });

  it("rejects something that isn't an aisle id without calling Picnic", async () => {
    const picnic = mockPicnic();
    await connect(picnic);

    expect((await call("get_favorites", { aisleId: "zuivel en eieren" })).isError).toBe(true);
    expect(picnic.catalog.getFavoritesInAisle).not.toHaveBeenCalled();
  });
});
