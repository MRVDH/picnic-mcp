#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import PicnicClient from "picnic-api";

import { MIN_TOKEN_LENGTH, startHttpServer } from "./http.js";
import { createServer } from "./server.js";
import { DEFAULT_TOOL_GROUPS, TOOL_GROUPS, parseToolGroups } from "./tools/groups.js";
import { COUNTRY_CODES, type CountryCode } from "./types.js";

const USAGE = `Usage:
  picnic-mcp          Serve the MCP server over stdio. Reads:
                        PICNIC_AUTH_KEY      the auth key (required)
                        PICNIC_COUNTRY_CODE  NL, DE or FR (default NL)
                        PICNIC_MCP_TOOLS     tool groups, comma-separated, from
                                             ${TOOL_GROUPS.join(", ")}
                                             (default ${DEFAULT_TOOL_GROUPS.join(",")})
  picnic-mcp http     Serve it over HTTP at /mcp instead, with the same variables and:
                        PICNIC_MCP_HTTP_TOKEN          bearer token clients send, at least
                                                       ${MIN_TOKEN_LENGTH} characters (required)
                        PICNIC_MCP_HTTP_HOST           address to listen on (default 127.0.0.1)
                        PICNIC_MCP_HTTP_PORT           port (default 3000)
                        PICNIC_MCP_HTTP_ALLOWED_HOSTS  host names allowed besides localhost,
                                                       comma-separated, e.g. a reverse proxy's
  picnic-mcp login    Sign in to Picnic and print an auth key for PICNIC_AUTH_KEY.`;

function parseCountryCode(value: string | undefined): CountryCode {
  const code = (value ?? "NL").trim().toUpperCase();
  if (!COUNTRY_CODES.includes(code as CountryCode)) {
    throw new Error(`Unknown country code "${value}". Use one of ${COUNTRY_CODES.join(", ")}.`);
  }
  return code as CountryCode;
}

/** Reads the Picnic settings from the environment, or exits with a message. */
function picnicSettings() {
  const authKey = process.env.PICNIC_AUTH_KEY?.trim();
  if (!authKey) {
    console.error(
      "PICNIC_AUTH_KEY is not set. Get an auth key with `npx picnic-mcp login`.\n\n" + USAGE
    );
    process.exit(1);
  }
  const countryCode = parseCountryCode(process.env.PICNIC_COUNTRY_CODE);
  const toolsEnv = process.env.PICNIC_MCP_TOOLS?.trim();
  const tools = toolsEnv ? parseToolGroups(toolsEnv) : DEFAULT_TOOL_GROUPS;
  return { authKey, countryCode, tools };
}

async function serve(): Promise<void> {
  const settings = picnicSettings();
  serveStdio(() => createServer(settings));
}

async function serveHttp(): Promise<void> {
  const { authKey, countryCode, tools } = picnicSettings();
  const token = process.env.PICNIC_MCP_HTTP_TOKEN?.trim() ?? "";
  if (token.length < MIN_TOKEN_LENGTH) {
    console.error(
      `PICNIC_MCP_HTTP_TOKEN must be set to a random value of at least ${MIN_TOKEN_LENGTH} characters, e.g. from \`openssl rand -hex 32\`. Clients send it as "Authorization: Bearer <token>".`
    );
    process.exit(1);
  }
  const host = process.env.PICNIC_MCP_HTTP_HOST?.trim() || "127.0.0.1";
  const port = Number(process.env.PICNIC_MCP_HTTP_PORT?.trim() || 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(
      `PICNIC_MCP_HTTP_PORT must be a port number, not "${process.env.PICNIC_MCP_HTTP_PORT}".`
    );
  }
  const allowedHosts = (process.env.PICNIC_MCP_HTTP_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  // One Picnic client for all requests; each request gets its own MCP server.
  const client = new PicnicClient({ authKey, countryCode });
  const server = await startHttpServer({
    token,
    host,
    port,
    allowedHosts,
    createServer: () => createServer({ client, countryCode, tools }),
    onError: (error) => console.error("[picnic-mcp]", error),
  });
  console.error(`picnic-mcp listening on ${server.url}`);
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    console.error(
      "This address can be reached from other machines, and the server doesn't use HTTPS. Put it behind an HTTPS reverse proxy."
    );
  }
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => void server.close().then(() => process.exit(0)));
  }
}

/** Asks for the login details on the terminal and prints the auth key. Stores nothing. */
async function login(): Promise<void> {
  // Output goes to stderr, so stdout carries only the auth key.
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) process.stderr.write(chunk);
      callback();
    },
  });
  const terminal = createInterface({ input: process.stdin, output, terminal: true });
  const ask = (question: string) => terminal.question(question);
  const askHidden = async (question: string) => {
    process.stderr.write(question);
    muted = true;
    const answer = await terminal.question("");
    muted = false;
    process.stderr.write("\n");
    return answer;
  };

  try {
    const countryCode = parseCountryCode((await ask("Country (NL, DE or FR) [NL]: ")) || "NL");
    const email = (await ask("Email: ")).trim();
    const password = await askHidden("Password: ");

    const client = new PicnicClient({ countryCode });
    const result = await client.auth.login(email, password);
    let authKey = result.authKey;
    if (result.secondFactorAuthenticationRequired) {
      await client.auth.generate2FACode("SMS");
      const code = (await ask("Code from the text message Picnic sent you: ")).trim();
      authKey = (await client.auth.verify2FACode(code)).authKey;
    }

    process.stderr.write("\nSigned in. Set this as PICNIC_AUTH_KEY:\n");
    process.stdout.write(`${authKey}\n`);
  } finally {
    terminal.close();
  }
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === undefined) return serve();
  if (command === "login") return login();
  if (command === "http") return serveHttp();
  console.error(
    command === "--help" || command === "-h" ? USAGE : `Unknown command "${command}".\n\n${USAGE}`
  );
  process.exit(command === "--help" || command === "-h" ? 0 : 1);
}

main().catch((error: unknown) => {
  if (PicnicClient.isPicnicApiError(error) && error.code === "AUTH_INVALID_CRED") {
    console.error("The email or password is wrong.");
  } else if (PicnicClient.isPicnicApiError(error) && error.code === "OTP_NOT_VALID") {
    console.error("The code is wrong or expired. Run `picnic-mcp login` again.");
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exit(1);
});
