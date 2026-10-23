import {
  type McpServer,
  createMcpHandler,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  originValidationResponse,
} from "@modelcontextprotocol/server";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  type IncomingMessage,
  type ServerResponse,
  createServer as createHttpServer,
} from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/** The only path the server answers on. */
export const MCP_PATH = "/mcp";

/** The shortest token the server accepts, so a weak token can't be guessed. */
export const MIN_TOKEN_LENGTH = 32;

/** Requests to the MCP endpoint are small JSON-RPC messages. */
const MAX_REQUEST_BODY_SIZE = 1024 * 1024;

export type HttpOptions = {
  /** Clients send it as `Authorization: Bearer <token>`. At least 32 characters. */
  token: string;
  /** Host names allowed in the Host and Origin headers besides localhost, e.g. a reverse proxy's. */
  allowedHosts?: string[];
  /** Called once per request: the MCP server that handles it. */
  createServer: () => McpServer;
  onError?: (error: Error) => void;
};

/**
 * The HTTP handler of the MCP endpoint, in fetch terms. Before a request reaches the MCP server it
 * must be for `/mcp`, have an allowed Host and Origin (against DNS rebinding) and carry the token.
 */
export function createHttpHandler(options: HttpOptions): {
  fetch: (request: Request) => Promise<Response>;
  close: () => Promise<void>;
} {
  if (options.token.length < MIN_TOKEN_LENGTH) {
    throw new Error(`The HTTP token must be at least ${MIN_TOKEN_LENGTH} characters.`);
  }
  const extraHosts = (options.allowedHosts ?? []).map((host) => host.toLowerCase());
  const hosts = [...localhostAllowedHostnames(), ...extraHosts];
  const origins = [...localhostAllowedOrigins(), ...extraHosts];
  const expected = digest(options.token);
  const mcp = createMcpHandler(() => options.createServer(), {
    maxRequestBodySize: MAX_REQUEST_BODY_SIZE,
    onerror: options.onError,
  });

  return {
    async fetch(request) {
      if (new URL(request.url).pathname !== MCP_PATH)
        return new Response("Not Found", { status: 404 });
      const rejected =
        hostHeaderValidationResponse(request, hosts) ?? originValidationResponse(request, origins);
      if (rejected) return rejected;
      if (!hasToken(request, expected)) {
        return new Response("Unauthorized", {
          status: 401,
          headers: { "WWW-Authenticate": 'Bearer realm="picnic-mcp"' },
        });
      }
      return mcp.fetch(request);
    },
    close: () => mcp.close(),
  };
}

/** Compares the request's bearer token in constant time, through digests of equal length. */
function hasToken(request: Request, expected: Buffer): boolean {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  return match !== null && timingSafeEqual(digest(match[1].trim()), expected);
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export type HttpServerOptions = HttpOptions & { host: string; port: number };

/**
 * Serves the MCP endpoint over HTTP with Node's own server. It doesn't do TLS: when it isn't on
 * localhost, put it behind an HTTPS reverse proxy.
 */
export async function startHttpServer(
  options: HttpServerOptions
): Promise<{ url: string; close: () => Promise<void> }> {
  const handler = createHttpHandler(options);
  const server = createHttpServer((req, res) => {
    serve(req, res, handler.fetch).catch((error: unknown) => {
      options.onError?.(error instanceof Error ? error : new Error(String(error)));
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port;
  const host = options.host.includes(":") ? `[${options.host}]` : options.host;
  return {
    url: `http://${host}:${port}${MCP_PATH}`,
    close: async () => {
      // Stop accepting connections, then end the open ones (keep-alive, SSE), which close waits for.
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      server.closeAllConnections();
      await Promise.all([closed, handler.close()]);
    },
  };
}

/** Turns a Node request into a fetch Request and streams the Response back, so SSE keeps working. */
async function serve(
  req: IncomingMessage,
  res: ServerResponse,
  handle: (request: Request) => Promise<Response>
): Promise<void> {
  const controller = new AbortController();
  res.on("close", () => controller.abort());

  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      headers.append(name, item);
    }
  }
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  // The Host header is checked by the handler; the URL only needs a valid origin to parse.
  const request = new Request(new URL(req.url ?? "/", "http://localhost"), {
    method: req.method,
    headers,
    signal: controller.signal,
    ...(hasBody && { body: Readable.toWeb(req) as ReadableStream, duplex: "half" }),
  } as RequestInit);

  const response = await handle(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (!response.body) {
    res.end();
    return;
  }
  await pipeline(Readable.fromWeb(response.body as never), res).catch(() => {
    // The client disconnected while the response was streaming.
  });
}
