import type { Candidate } from "./format/products.js";
import type { SearchResults } from "./types.js";

/** The section type of "Opnieuw bestellen": the products the user bought before. */
const BOUGHT_BEFORE_SECTION = "RFY";

/** At most this many products are offered to choose between. */
const MAX_CHOICES = 3;

export type Match =
  /** One product fits: add it. */
  | { type: "best"; best: Candidate; others: Candidate[] }
  /** Several fit, or none was bought before: ask the user. */
  | { type: "choose"; choices: Candidate[]; others: Candidate[] }
  /** Nothing that can be ordered. */
  | { type: "none"; others: Candidate[] };

/**
 * Lists the products of the search results in display order, once each, marking the ones in the
 * bought-before section. The search has no per-product order count: a tile's `numberOfOrders` is
 * the same on every tile.
 */
export function listCandidates(results: SearchResults): Candidate[] {
  const candidates = new Map<string, Candidate>();
  for (const section of results.products?.sections ?? []) {
    const boughtBefore = section.type === BOUGHT_BEFORE_SECTION;
    for (const tile of section.products) {
      const existing = candidates.get(tile.id);
      if (existing) existing.boughtBefore ||= boughtBefore;
      else candidates.set(tile.id, { tile, boughtBefore });
    }
  }
  return [...candidates.values()];
}

/**
 * Picks what to add from the search results:
 * - one available product bought before: that product;
 * - several bought before: those to choose from, in Picnic's order;
 * - none bought before: the first results to choose from, or the only one if there is one.
 */
export function matchProducts(candidates: Candidate[]): Match {
  const available = candidates.filter((candidate) => !candidate.tile.isUnavailable);
  const bought = available.filter((candidate) => candidate.boughtBefore);
  const pool = bought.length > 0 ? bought : available;
  const without = (picked: Candidate[]) =>
    candidates.filter((candidate) => !picked.includes(candidate));

  if (pool.length === 1) {
    return { type: "best", best: pool[0], others: without(pool) };
  }
  if (pool.length > 1) {
    const choices = pool.slice(0, MAX_CHOICES);
    return { type: "choose", choices, others: without(choices) };
  }
  return { type: "none", others: candidates };
}
