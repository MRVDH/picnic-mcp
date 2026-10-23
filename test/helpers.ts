import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import PicnicClient from "picnic-api";
import { afterEach, vi } from "vitest";

import { type CreateServerOptions, createServer } from "../src/index.js";

/** A picnic-api client with every method the tools call mocked. */
export function mockPicnic() {
  return {
    catalog: {
      getSearchResults: vi.fn(),
      getProduct: vi.fn(),
      getImageUrl: vi.fn((imageId: string) => `https://images.example.com/${imageId}.png`),
      getPromotions: vi.fn(),
      getPromotionGroup: vi.fn(),
      getFavorites: vi.fn(),
      getFavoritesInAisle: vi.fn(),
    },
    cart: {
      getCart: vi.fn(),
      addProductToCart: vi.fn(),
      removeProductFromCart: vi.fn(),
      getDeliverySlots: vi.fn(),
      setDeliverySlot: vi.fn(),
      getReplacements: vi.fn(),
    },
    delivery: { getDeliverySummaries: vi.fn(), getDeliveryPosition: vi.fn(), getDelivery: vi.fn() },
    recipe: {
      getRecipe: vi.fn(),
      addRecipeToCart: vi.fn(),
      removeRecipeFromCart: vi.fn(),
      getSavedRecipes: vi.fn(),
      saveRecipe: vi.fn(),
      unsaveRecipe: vi.fn(),
    },
  };
}

export type MockPicnic = ReturnType<typeof mockPicnic>;

let client: Client | undefined;

afterEach(async () => {
  await client?.close();
  client = undefined;
});

/** What the test client answers when the server asks the user to fill in a form. */
export type ElicitAnswer = {
  action: "accept" | "decline" | "cancel";
  content?: Record<string, string | number | boolean | string[]>;
};

/**
 * Connects an MCP client to a server on the mock over the in-memory transport. With `elicit`, the
 * client declares form elicitation and answers the server's forms with it.
 */
export async function connect(
  picnic: MockPicnic,
  options: Pick<CreateServerOptions, "tools" | "onError"> & {
    elicit?: (request: { message: string; requestedSchema: unknown }) => ElicitAnswer;
  } = {}
): Promise<Client> {
  const { elicit, ...serverOptions } = options;
  const server = createServer({
    client: picnic as unknown as PicnicClient,
    onError: vi.fn(),
    ...serverOptions,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client(
    { name: "test", version: "1.0.0" },
    elicit ? { capabilities: { elicitation: { form: {} } } } : undefined
  );
  if (elicit) {
    client.setRequestHandler("elicitation/create", async (request) =>
      elicit(request.params as { message: string; requestedSchema: unknown })
    );
  }
  await client.connect(clientTransport);
  return client;
}

/** Calls a tool on the connected server and returns its text, parsed on request. */
export async function call(name: string, args: Record<string, unknown> = {}) {
  if (!client) throw new Error("Call connect() first");
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[])[0].text;
  return {
    isError: result.isError ?? false,
    text,
    json: () => JSON.parse(text),
    /** The image URLs the result carries in `_meta`, by product id. */
    images: () => (result._meta as Record<string, unknown> | undefined)?.["picnic-mcp/images"],
  };
}
