// Made-up data in the shape of picnic-api's models. Never copy real account data in here.
import { describe, expect, it, vi } from "vitest";

import { searchResults, tile } from "./fixtures.js";
import { type ElicitAnswer, call, connect, mockPicnic } from "./helpers.js";

/** Search results without a clear match: two products to choose from. */
function picnicWithChoices() {
  const picnic = mockPicnic();
  picnic.catalog.getSearchResults.mockResolvedValue(
    searchResults(
      [],
      [tile({ id: "s1", name: "Halfvolle melk" }), tile({ id: "s2", name: "Volle melk" })]
    )
  );
  return picnic;
}

describe("search_products choices in the client", () => {
  it("asks the user to pick a product and returns it as the best match", async () => {
    const picnic = picnicWithChoices();
    const elicit = vi.fn(
      (_request: { message: string; requestedSchema: unknown }): ElicitAnswer => ({
        action: "accept",
        content: { productId: "s2" },
      })
    );
    await connect(picnic, { elicit });

    const result = (await call("search_products", { query: "melk" })).json();
    expect(elicit).toHaveBeenCalledTimes(1);
    const request = elicit.mock.calls[0][0];
    expect(request.message).toBe('Welke "melk" wil je?');
    expect(request.requestedSchema).toMatchObject({
      properties: {
        productId: {
          oneOf: [
            { const: "s1", title: "Halfvolle melk · 1 stuk · € 1,99" },
            { const: "s2", title: "Volle melk · 1 stuk · € 1,99" },
            { const: "none", title: "Geen van deze" },
          ],
        },
      },
    });
    expect(result.bestMatch.productId).toBe("s2");
    expect(result.next).toMatch(/user picked/);
    expect(result.choices).toBeUndefined();
  });

  it("says so when the user wants none of them", async () => {
    await connect(picnicWithChoices(), {
      elicit: () => ({ action: "accept", content: { productId: "none" } }),
    });

    const result = (await call("search_products", { query: "melk" })).json();
    expect(result.next).toMatch(/none of these/);
    expect(result.bestMatch).toBeUndefined();
  });

  it("returns the choices when the user declines or cancels", async () => {
    for (const action of ["decline", "cancel"] as const) {
      await connect(picnicWithChoices(), { elicit: () => ({ action }) });

      const result = (await call("search_products", { query: "melk" })).json();
      expect(result.choices.map((p: { productId: string }) => p.productId)).toEqual(["s1", "s2"]);
      expect(result.next).toMatch(/ask the user/i);
    }
  });

  it("ignores a product id that wasn't one of the choices", async () => {
    await connect(picnicWithChoices(), {
      elicit: () => ({ action: "accept", content: { productId: "s9" } }),
    });

    const result = (await call("search_products", { query: "melk" })).json();
    expect(result.bestMatch).toBeUndefined();
    expect(result.choices).toHaveLength(2);
  });

  it("doesn't ask when the client can't show a form, or when there is a clear match", async () => {
    await connect(picnicWithChoices());
    expect((await call("search_products", { query: "melk" })).json().choices).toHaveLength(2);

    const picnic = mockPicnic();
    picnic.catalog.getSearchResults.mockResolvedValue(searchResults([tile({ id: "s1" })], []));
    const elicit = vi.fn((): ElicitAnswer => ({ action: "cancel" }));
    await connect(picnic, { elicit });
    expect((await call("search_products", { query: "melk" })).json().bestMatch.productId).toBe(
      "s1"
    );
    expect(elicit).not.toHaveBeenCalled();
  });
});
