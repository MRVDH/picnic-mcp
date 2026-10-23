import type { ToolGroup } from "../src/index.js";
import { RECIPE_ID, type fakePicnic } from "./fake-picnic.js";

export type ToolCall = { name: string; args: Record<string, unknown>; isError: boolean };

/** What happened in a case: the tool calls, the model's answer and the fake's state after. */
export type Outcome = {
  calls: ToolCall[];
  text: string;
  picnic: ReturnType<typeof fakePicnic>;
};

export type Case = {
  id: string;
  /** What the user says, as they would in a chat. */
  message: string;
  /** The tool groups to turn on. Default: picnic-mcp's default groups. */
  tools?: ToolGroup[];
  /** The cart before the message, product id to quantity. */
  cart?: Record<string, number>;
  /** Returns why the case failed, or null when it passed. */
  check: (outcome: Outcome) => string | null;
};

const CART_CHANGES = [
  "add_to_cart",
  "remove_from_cart",
  "set_cart_quantity",
  "select_delivery_slot",
  "add_recipe_to_cart",
  "remove_recipe_from_cart",
];

const called = ({ calls }: Outcome, name: string) => calls.filter((call) => call.name === name);

/** Checks that the cart has exactly these quantities. */
function cartIs(outcome: Outcome, expected: Record<string, number>): string | null {
  const actual = outcome.picnic.quantities();
  const same =
    Object.keys(actual).length === Object.keys(expected).length &&
    Object.entries(expected).every(([id, quantity]) => actual[id] === quantity);
  return same ? null : `cart is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`;
}

function unchanged(outcome: Outcome): string | null {
  const changes = outcome.calls.filter((call) => CART_CHANGES.includes(call.name));
  return changes.length === 0
    ? null
    : `changed the cart: ${changes.map((call) => call.name).join(", ")}`;
}

function needs(outcome: Outcome, name: string): string | null {
  return called(outcome, name).length > 0 ? null : `didn't call ${name}`;
}

const first = (...checks: (string | null)[]) => checks.find((check) => check !== null) ?? null;

export const CASES: Case[] = [
  {
    id: "add one product bought before",
    message: "Doe halfvolle melk in mijn mandje",
    check: (o) => cartIs(o, { s1000001: 1 }),
  },
  {
    id: "add a quantity",
    message: "Zet 2 pakken halfvolle melk in mijn mandje",
    check: (o) => cartIs(o, { s1000001: 2 }),
  },
  {
    id: "add several products",
    message: "Ik heb melk, eieren en brood nodig",
    check: (o) => cartIs(o, { s1000001: 1, s1000003: 1, s1000004: 1 }),
  },
  {
    id: "several products in one add_to_cart call",
    message: "Doe bananen, toiletpapier en kaas in mijn mandje",
    check: (o) =>
      first(
        cartIs(o, { s1000005: 1, s1000008: 1, s1000010: 1 }),
        called(o, "add_to_cart").length === 1
          ? null
          : `${called(o, "add_to_cart").length} add_to_cart calls`
      ),
  },
  {
    id: "English request, Dutch search",
    message: "Please add bananas to my cart",
    check: (o) => cartIs(o, { s1000005: 1 }),
  },
  {
    id: "ask when there is no clear match",
    message: "Doe pindakaas in mijn mandje",
    check: (o) =>
      first(
        unchanged(o),
        /pindakaas/i.test(o.text) ? null : "the answer doesn't offer the choices"
      ),
  },
  {
    id: "set a quantity",
    message: "Maak er 4 halfvolle melk van",
    cart: { s1000001: 1, s1000003: 1 },
    check: (o) => cartIs(o, { s1000001: 4, s1000003: 1 }),
  },
  {
    id: "remove a product",
    message: "Haal de eieren uit mijn mandje",
    cart: { s1000001: 1, s1000003: 2 },
    check: (o) => cartIs(o, { s1000001: 1 }),
  },
  {
    id: "cart total",
    message: "Wat kost mijn mandje nu?",
    cart: { s1000001: 2, s1000004: 1 },
    check: (o) =>
      first(
        needs(o, "get_cart"),
        unchanged(o),
        /4[,.]67/.test(o.text) ? null : "the answer doesn't give € 4,67"
      ),
  },
  {
    id: "allergens of a product",
    message: "Zit er gluten in het volkoren brood?",
    check: (o) =>
      first(
        needs(o, "get_product"),
        unchanged(o),
        /\b(ja|yes)\b|bevat/i.test(o.text) ? null : "the answer doesn't say it has gluten"
      ),
  },
  {
    id: "list delivery slots",
    message: "Welke bezorgmomenten zijn er?",
    check: (o) => first(needs(o, "get_delivery_slots"), unchanged(o)),
  },
  {
    id: "pick the earliest slot",
    message: "Laat mijn boodschappen in het vroegste bezorgmoment bezorgen",
    // Selecting it is right; so is offering it first, since the description asks for the user's pick.
    check: (o) => {
      const selected = o.picnic.selectedSlotId();
      if (selected === "slot-1-8") return null;
      if (selected === null && /08[:.]00/.test(o.text)) return null;
      return `selected ${selected}, expected slot-1-8 or offering it`;
    },
  },
  {
    id: "promotions in a category",
    message: "Wat is er in de aanbieding bij de zuivel?",
    check: (o) =>
      first(
        needs(o, "get_promotions"),
        unchanged(o),
        /yoghurt/i.test(o.text) ? null : "the answer doesn't name the yoghurt"
      ),
  },
  {
    id: "usual products",
    message: "Wat koop ik meestal aan zuivel?",
    check: (o) => first(needs(o, "get_favorites"), unchanged(o)),
  },
  {
    id: "never order",
    message: "Bestel mijn boodschappen maar",
    cart: { s1000001: 1 },
    check: (o) => unchanged(o),
  },
  {
    id: "add a shared recipe link",
    message: `Zet dit recept in mijn mandje: https://picnic.app/nl/recepten/${RECIPE_ID}`,
    tools: ["cart", "recipes"],
    check: (o) =>
      called(o, "add_recipe_to_cart").some((call) => String(call.args.recipeId).includes(RECIPE_ID))
        ? null
        : "didn't add the recipe",
  },
  {
    id: "what was in the last order",
    message: "Wat heb ik vorige keer besteld?",
    tools: ["cart", "deliveries"],
    check: (o) =>
      first(
        called(o, "get_deliveries").some((call) => call.args.when === "past")
          ? null
          : "didn't ask for past deliveries",
        unchanged(o),
        /brood/i.test(o.text) ? null : "the answer doesn't list the products"
      ),
  },
];
