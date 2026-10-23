import {
  CLIENT_CAPABILITIES_META_KEY,
  type ClientCapabilities,
  type McpServer,
  type ServerContext,
  inputRequired,
  inputResponse,
} from "@modelcontextprotocol/server";
import * as z from "zod";

import { formatProduct } from "../format/products.js";
import type { Candidate } from "../format/products.js";
import { listCandidates, matchProducts } from "../match.js";
import type { CountryCode } from "../types.js";
import { SEARCH_LANGUAGES, type ToolContext, imageUrls } from "./context.js";
import { jsonResult, runTool } from "./result.js";

/** At most this many products in the output, to keep it short. */
const MAX_PRODUCTS = 8;

/** The key of the choice in the elicitation request and its response. */
const CHOICE_KEY = "choice";
/** The option for "none of these" in the choice. */
const NONE = "none";

/** The texts of the choice the user sees in their client, in the account's language. */
const CHOICE_TEXTS: Record<CountryCode, { question: (query: string) => string; none: string }> = {
  NL: { question: (query) => `Welke "${query}" wil je?`, none: "Geen van deze" },
  DE: { question: (query) => `Welches Produkt für „${query}“?`, none: "Keins davon" },
  FR: { question: (query) => `Quel produit pour « ${query} » ?`, none: "Aucun de ceux-ci" },
};

export function registerSearchProducts(server: McpServer, context: ToolContext): void {
  const language = SEARCH_LANGUAGES[context.countryCode];
  const canAskUser = (ctx: ServerContext) => {
    const envelope = ctx.mcpReq.envelope as Record<string, unknown> | undefined;
    const capabilities =
      (envelope?.[CLIENT_CAPABILITIES_META_KEY] as ClientCapabilities | undefined) ??
      server.server.getClientCapabilities();
    const elicitation = capabilities?.elicitation;
    // An empty elicitation capability means form mode.
    return elicitation !== undefined && (elicitation.form !== undefined || !elicitation.url);
  };

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
    ({ query }, ctx) =>
      runTool(async () => {
        const results = await context.client.catalog.getSearchResults(query);
        const match = matchProducts(listCandidates(results));
        const format = (candidates: Candidate[]) =>
          candidates.map((candidate) => formatProduct(candidate, context.countryCode));
        const corrected =
          results.correctedQuery && results.correctedQuery !== query
            ? { searchedFor: results.correctedQuery }
            : {};

        const images = (shown: Candidate[]) =>
          imageUrls(
            context,
            shown.map(({ tile }) => ({ productId: tile.id, imageId: tile.imageId }))
          );

        const bestMatch = (best: Candidate, others: Candidate[], next: string) => {
          const shown = others.slice(0, MAX_PRODUCTS - 1);
          return jsonResult(
            {
              ...corrected,
              next,
              bestMatch: formatProduct(best, context.countryCode),
              otherResults: format(shown),
            },
            images([best, ...shown])
          );
        };

        if (match.type === "best") {
          return bestMatch(
            match.best,
            match.others,
            "Add bestMatch with add_to_cart, unless the user asked for something else."
          );
        }
        if (match.type === "choose") {
          // A client that can show a form lets the user pick; the search runs again on its answer.
          if (canAskUser(ctx)) {
            const answer = inputResponse(ctx.mcpReq.inputResponses, CHOICE_KEY);
            if (answer.kind === "missing") {
              return inputRequired({
                inputRequests: {
                  [CHOICE_KEY]: inputRequired.elicit({
                    message: CHOICE_TEXTS[context.countryCode].question(query),
                    requestedSchema: choiceSchema(match.choices, context.countryCode),
                  }),
                },
              });
            }
            const picked =
              answer.kind === "elicit" && answer.action === "accept"
                ? answer.content?.productId
                : undefined;
            if (picked === NONE) {
              return jsonResult({
                ...corrected,
                next: "The user wants none of these products. Ask what they want instead, or search with other words.",
              });
            }
            const chosen = match.choices.find((choice) => choice.tile.id === picked);
            if (chosen) {
              return bestMatch(
                chosen,
                candidatesWithout(match, chosen),
                "The user picked bestMatch: add it with add_to_cart."
              );
            }
          }

          const others = match.others.slice(0, MAX_PRODUCTS - match.choices.length);
          return jsonResult(
            {
              ...corrected,
              next: "Ask the user which of the choices they want and wait for the answer. Don't call add_to_cart before the user picked one: there is no clear match.",
              choices: format(match.choices),
              otherResults: format(others),
            },
            images([...match.choices, ...others])
          );
        }
        const others = match.others.slice(0, MAX_PRODUCTS);
        return jsonResult(
          {
            ...corrected,
            next:
              others.length > 0
                ? "None of the results can be ordered right now. Tell the user, or try another search term."
                : "Nothing found. Try another search term, or tell the user.",
            otherResults: format(others),
          },
          images(others)
        );
      }, context.onError)
  );
}

/** The candidates of a choice, without the one the user picked. */
function candidatesWithout(
  match: { choices: Candidate[]; others: Candidate[] },
  picked: Candidate
): Candidate[] {
  return [...match.choices, ...match.others].filter((candidate) => candidate !== picked);
}

/** A form with one choice: each product with its size and price, and "none of these". */
function choiceSchema(choices: Candidate[], countryCode: CountryCode) {
  const options = choices.map((choice) => {
    const product = formatProduct(choice, countryCode);
    return {
      const: product.productId,
      title: [product.name, product.size, product.price].filter(Boolean).join(" · "),
    };
  });
  return {
    type: "object" as const,
    properties: {
      productId: {
        type: "string" as const,
        title: "Product",
        oneOf: [...options, { const: NONE, title: CHOICE_TEXTS[countryCode].none }],
      },
    },
    required: ["productId"],
  };
}
