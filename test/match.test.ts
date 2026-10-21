import { describe, expect, it } from "vitest";

import { listCandidates, matchProducts } from "../src/match.js";
import { searchResults, tile } from "./fixtures.js";

const ids = (candidates: { tile: { id: string } }[]) => candidates.map((c) => c.tile.id);

describe("listCandidates", () => {
  it("lists each product once, marking bought-before ones from the RFY section", () => {
    const candidates = listCandidates(
      searchResults([tile({ id: "s1" })], [tile({ id: "s1" }), tile({ id: "s2" })])
    );
    expect(ids(candidates)).toEqual(["s1", "s2"]);
    expect(candidates.map((c) => c.boughtBefore)).toEqual([true, false]);
  });

  it("ignores numberOfOrders, which is the same on every tile", () => {
    const [candidate] = listCandidates(searchResults([], [tile({ id: "s1", numberOfOrders: 3 })]));
    expect(candidate.boughtBefore).toBe(false);
  });

  it("returns nothing without product results", () => {
    expect(listCandidates({ ...searchResults([], []), products: null })).toEqual([]);
  });
});

describe("matchProducts", () => {
  const match = (boughtBefore: Parameters<typeof tile>[0][], other: Parameters<typeof tile>[0][]) =>
    matchProducts(listCandidates(searchResults(boughtBefore.map(tile), other.map(tile))));

  it("picks the only product bought before", () => {
    const result = match([{ id: "s1" }], [{ id: "s2" }, { id: "s3" }]);
    expect(result.type).toBe("best");
    expect(result.type === "best" && result.best.tile.id).toBe("s1");
    expect(ids(result.others)).toEqual(["s2", "s3"]);
  });

  it("offers the products bought before when there are several, in the order of the results", () => {
    const result = match([{ id: "s1" }, { id: "s2" }, { id: "s3" }, { id: "s4" }], [{ id: "s5" }]);
    expect(result.type).toBe("choose");
    expect(result.type === "choose" && ids(result.choices)).toEqual(["s1", "s2", "s3"]);
    expect(ids(result.others)).toEqual(["s4", "s5"]);
  });

  it("skips unavailable products", () => {
    const result = match([{ id: "s1", isUnavailable: true }, { id: "s2" }], [{ id: "s3" }]);
    expect(result.type === "best" && result.best.tile.id).toBe("s2");
  });

  it("offers the first results when nothing was bought before", () => {
    const result = match([], [{ id: "s1" }, { id: "s2" }, { id: "s3" }, { id: "s4" }]);
    expect(result.type === "choose" && ids(result.choices)).toEqual(["s1", "s2", "s3"]);
    expect(ids(result.others)).toEqual(["s4"]);
  });

  it("picks the only result when nothing was bought before", () => {
    expect(match([], [{ id: "s1" }]).type).toBe("best");
  });

  it("reports nothing when no product can be ordered", () => {
    const result = match([], [{ id: "s1", isUnavailable: true }]);
    expect(result.type).toBe("none");
    expect(ids(result.others)).toEqual(["s1"]);
  });
});
