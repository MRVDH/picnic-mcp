import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import PicnicClient from "picnic-api";
import { afterEach, vi } from "vitest";

import { type CreateServerOptions, createServer } from "../src/index.js";

/** A picnic-api client with every method the tools call mocked. */
export function mockPicnic() {
  return {
    catalog: { getSearchResults: vi.fn(), getProduct: vi.fn() },
    cart: {
      getCart: vi.fn(),
      addProductToCart: vi.fn(),
      removeProductFromCart: vi.fn(),
      getDeliverySlots: vi.fn(),
      setDeliverySlot: vi.fn(),
      getReplacements: vi.fn(),
    },
    delivery: { getDeliverySummaries: vi.fn(), getDeliveryPosition: vi.fn(), getDelivery: vi.fn() },
    recipe: { getRecipe: vi.fn(), addRecipeToCart: vi.fn(), removeRecipeFromCart: vi.fn() },
  };
}

export type MockPicnic = ReturnType<typeof mockPicnic>;

let client: Client | undefined;

afterEach(async () => {
  await client?.close();
  client = undefined;
});

/** Connects an MCP client to a server on the mock over the in-memory transport. */
export async function connect(
  picnic: MockPicnic,
  options: Pick<CreateServerOptions, "tools" | "onError"> = {}
): Promise<Client> {
  const server = createServer({
    client: picnic as unknown as PicnicClient,
    onError: vi.fn(),
    ...options,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientTransport);
  return client;
}

/** Calls a tool on the connected server and returns its text, parsed on request. */
export async function call(name: string, args: Record<string, unknown> = {}) {
  if (!client) throw new Error("Call connect() first");
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[])[0].text;
  return { isError: result.isError ?? false, text, json: () => JSON.parse(text) };
}
