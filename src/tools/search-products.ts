import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";

import { formatProduct } from "../format/products.js";
import type { Candidate } from "../format/products.js";
import { listCandidates, matchProducts } from "../match.js";
import { SEARCH_LANGUAGES, type ToolContext } from "./context.js";
import { jsonResult, runTool } from "./result.js";

/** At most this many products in the output, to keep it short. */
const MAX_PRODUCTS = 8;

export function registerSearchProducts(server: McpServer, context: ToolContext): void {
  const language = SEARCH_LANGUAGES[context.countryCode];
  server.registerTool(
    "search_products",
    {
      title: "Search products",
      description:
        "Search the Picnic supermarket for a product and get its id for add_to_cart. " +
        `Write the query in ${language}, as a short product name. ` +
        "The result has `bestMatch` when one product fits, usually one the user bought before: add that one. " +
        "It has `choices` when there is no clear match: ask the user which one they want before adding anything. `boughtBefore` marks products the user ordered before.",
      inputSchema: z.object({
        query: z.string().trim().min(1).describe(`The product to search for, in ${language}.`),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ query }) =>
      runTool(async () => {
        const results = await context.client.catalog.getSearchResults(query);
        const match = matchProducts(listCandidates(results));
        const format = (candidates: Candidate[]) =>
          candidates.map((candidate) => formatProduct(candidate, context.countryCode));
        const corrected =
          results.correctedQuery && results.correctedQuery !== query
            ? { searchedFor: results.correctedQuery }
            : {};

        if (match.type === "best") {
          return jsonResult({
            ...corrected,
            next: "Add bestMatch with add_to_cart, unless the user asked for something else.",
            bestMatch: formatProduct(match.best, context.countryCode),
            otherResults: format(match.others.slice(0, MAX_PRODUCTS - 1)),
          });
        }
        if (match.type === "choose") {
          return jsonResult({
            ...corrected,
            next: "No clear match. Ask the user which of the choices they want, then add it with add_to_cart.",
            choices: format(match.choices),
            otherResults: format(match.others.slice(0, MAX_PRODUCTS - match.choices.length)),
          });
        }
        return jsonResult({
          ...corrected,
          next:
            match.others.length > 0
              ? "None of the results can be ordered right now. Tell the user, or try another search term."
              : "Nothing found. Try another search term, or tell the user.",
          otherResults: format(match.others.slice(0, MAX_PRODUCTS)),
        });
      }, context.onError)
  );
}
