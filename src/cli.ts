#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import PicnicClient from "picnic-api";

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
  picnic-mcp login    Sign in to Picnic and print an auth key for PICNIC_AUTH_KEY.`;

function parseCountryCode(value: string | undefined): CountryCode {
  const code = (value ?? "NL").trim().toUpperCase();
  if (!COUNTRY_CODES.includes(code as CountryCode)) {
    throw new Error(`Unknown country code "${value}". Use one of ${COUNTRY_CODES.join(", ")}.`);
  }
  return code as CountryCode;
}

async function serve(): Promise<void> {
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
  serveStdio(() => createServer({ authKey, countryCode, tools }));
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
