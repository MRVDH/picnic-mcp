import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import PicnicClient from "picnic-api";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createHttpHandler, startHttpServer } from "../src/http.js";
import { createServer } from "../src/index.js";
import { cart, line } from "./fixtures.js";
import { mockPicnic } from "./helpers.js";

const TOKEN = "a".repeat(40);

let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  await close?.();
  close = undefined;
});

async function start(allowedHosts: string[] = []) {
  const picnic = mockPicnic();
  picnic.cart.getCart.mockResolvedValue(cart([line({ productId: "s1", quantity: 2 })]));
  const server = await startHttpServer({
    token: TOKEN,
    host: "127.0.0.1",
    port: 0,
    allowedHosts,
    createServer: () =>
      createServer({ client: picnic as unknown as PicnicClient, onError: vi.fn() }),
  });
  close = server.close;
  return server.url;
}

const listTools = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };

function post(url: string, headers: Record<string, string>) {
  return fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify(listTools),
  });
}

describe("HTTP mode", () => {
  it("serves the tools to a client with the token", async () => {
    const url = await start();
    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(url), {
        requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
      })
    );

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("get_cart");
    const result = await client.callTool({ name: "get_cart", arguments: {} });
    expect(JSON.parse((result.content as { text: string }[])[0].text).itemCount).toBe(2);
    await client.close();
  });

  it("answers 401 without the token or with a wrong one", async () => {
    const url = await start();

    for (const headers of [
      {},
      { authorization: `Bearer ${"b".repeat(40)}` },
      { authorization: TOKEN },
    ] as Record<string, string>[]) {
      const response = await post(url, headers);
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toMatch(/^Bearer/);
    }
  });

  it("rejects a foreign Host or Origin, against DNS rebinding", async () => {
    const url = await start();
    const auth = { authorization: `Bearer ${TOKEN}` };

    expect((await post(url, { ...auth, origin: "https://evil.example.com" })).status).toBe(403);
    const handler = createHttpHandler({ token: TOKEN, createServer: vi.fn() as never });
    const response = await handler.fetch(
      new Request("http://evil.example.com/mcp", {
        method: "POST",
        headers: { host: "evil.example.com", ...auth },
        body: JSON.stringify(listTools),
      })
    );
    expect(response.status).toBe(403);
    await handler.close();
  });

  it("allows the extra host names, e.g. a reverse proxy's", async () => {
    const handler = createHttpHandler({
      token: TOKEN,
      allowedHosts: ["picnic.example.com"],
      createServer: () => createServer({ client: mockPicnic() as unknown as PicnicClient }),
    });
    const response = await handler.fetch(
      new Request("https://picnic.example.com/mcp", {
        method: "POST",
        headers: {
          host: "picnic.example.com",
          origin: "https://picnic.example.com",
          authorization: `Bearer ${TOKEN}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify(listTools),
      })
    );
    expect(response.status).toBe(200);
    await handler.close();
  });

  it("only answers on /mcp", async () => {
    const url = await start();
    const response = await fetch(url.replace("/mcp", "/other"), {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(response.status).toBe(404);
  });

  it("refuses a short token", () => {
    expect(() => createHttpHandler({ token: "short", createServer: vi.fn() as never })).toThrow(
      /at least 32 characters/
    );
  });
});
