import { McpServer } from "@modelcontextprotocol/server";
import { createRequire } from "node:module";
import PicnicClient from "picnic-api";

import type { ToolContext } from "./tools/context.js";
import {
  DEFAULT_TOOL_GROUPS,
  type ToolGroup,
  registerToolGroups,
  toolGroupInstructions,
} from "./tools/groups.js";
import type { CountryCode } from "./types.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

export type CreateServerOptions = (
  | {
      /** The Picnic auth key of the account, from `picnic-mcp login`. */
      authKey: string;
      /** The country of the account. Default: "NL". */
      countryCode?: CountryCode;
    }
  | {
      /** A picnic-api client that is already signed in. */
      client: PicnicClient;
      /** The country of the client's account. Default: "NL". */
      countryCode?: CountryCode;
    }
) & {
  /** The tool groups to turn on. Default: `["cart", "slots", "product"]`. */
  tools?: readonly ToolGroup[];
  /** Called with errors from Picnic before the tool returns a short message. Default: log to stderr. */
  onError?: (error: unknown) => void;
};

/**
 * Creates an MCP server with tools to search Picnic's products and change the cart, plus the
 * other tool groups that are turned on. It reads no environment variables or files, so it can run
 * in-process: connect it to a transport with `server.connect(transport)`.
 */
export function createServer(options: CreateServerOptions): McpServer {
  const countryCode = options.countryCode ?? "NL";
  const groups = options.tools ?? DEFAULT_TOOL_GROUPS;
  const context: ToolContext = {
    client:
      "client" in options
        ? options.client
        : new PicnicClient({ authKey: options.authKey, countryCode }),
    countryCode,
    onError: options.onError ?? ((error) => console.error("[picnic-mcp]", error)),
  };

  const server = new McpServer(
    { name: "picnic-mcp", version },
    {
      capabilities: { tools: {} },
      instructions:
        "Tools for the user's account at the online supermarket Picnic. " +
        toolGroupInstructions(context, groups) +
        " These tools can change the cart but cannot place an order.",
    }
  );
  registerToolGroups(server, context, groups);
  return server;
}
