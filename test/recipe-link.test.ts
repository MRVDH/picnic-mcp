import { describe, expect, it, vi } from "vitest";

import { resolveRecipeLink } from "../src/recipe-link.js";

// Made-up ids and short codes.
const ID = "0123456789abcdef01234567";
const OWN_ID = "0123456789abcdef0123456789abcdef";

/** A fetch that ends on the given URL, as after following redirects. */
function fetchEndingAt(url: string) {
  return vi.fn<typeof fetch>(
    async () => ({ url, body: { cancel: vi.fn(async () => {}) } }) as unknown as Response
  );
}

describe("resolveRecipeLink", () => {
  it("passes text that isn't a URL on as the recipe id", async () => {
    const fetch = fetchEndingAt("");
    expect(await resolveRecipeLink(` ${ID} `, fetch)).toBe(ID);
    expect(await resolveRecipeLink("r1", fetch)).toBe("r1");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads the id from a recipe page URL without a request", async () => {
    const fetch = fetchEndingAt("");
    expect(await resolveRecipeLink(`https://picnic.app/nl/recepten/${ID}`, fetch)).toBe(ID);
    expect(await resolveRecipeLink(`https://www.picnic.app/de/rezepte/${OWN_ID}/x`, fetch)).toBe(
      OWN_ID
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("follows a short link to the recipe page and reads the id there", async () => {
    const final =
      `https://picnic.app/nl/recepten/${ID}` +
      `?path=store%2Fpage%3Bid%3Dselling-group-details-page%2Cselling_group_id%3D${ID}%2CsharedPage%3Dtrue`;
    const fetch = fetchEndingAt(final);

    expect(await resolveRecipeLink("https://picnic.app/nl/go/abc1234", fetch)).toBe(ID);
    expect(fetch).toHaveBeenCalledWith(
      new URL("https://picnic.app/nl/go/abc1234"),
      expect.objectContaining({ redirect: "follow" })
    );
    // No auth key or other headers go along.
    expect(fetch.mock.calls[0]).toHaveLength(2);
    expect(fetch.mock.calls[0][1]).not.toHaveProperty("headers");
  });

  it("reads the id from the deeplink parameter alone", async () => {
    const fetch = fetchEndingAt(
      `https://picnic.app/nl/x?path=store%2Fpage%3Bid%3Dselling-group-details-page%2Cselling_group_id%3D${ID}`
    );
    expect(await resolveRecipeLink("https://picnic.app/nl/go/abc1234", fetch)).toBe(ID);
  });

  it("returns null for other sites, without a request", async () => {
    const fetch = fetchEndingAt("");
    for (const link of [
      "https://example.com/recepten/" + ID,
      "http://picnic.app/nl/go/abc1234",
      "https://picnic.app.example.com/nl/go/abc1234",
    ]) {
      expect(await resolveRecipeLink(link, fetch)).toBeNull();
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns null when the link leads off picnic.app or to another page", async () => {
    expect(
      await resolveRecipeLink(
        "https://picnic.app/nl/go/abc1234",
        fetchEndingAt(`https://example.com/recepten/${ID}`)
      )
    ).toBeNull();
    expect(
      await resolveRecipeLink(
        "https://picnic.app/nl/go/abc1234",
        fetchEndingAt("https://picnic.app/nl/")
      )
    ).toBeNull();
  });
});
