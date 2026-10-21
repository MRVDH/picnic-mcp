import type { CallToolResult } from "@modelcontextprotocol/server";

import { describeError } from "../errors.js";

/** Returns data as compact JSON text: models read the text, and indentation only costs tokens. */
export function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

export function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Runs a tool handler and turns a thrown error into a short tool error. */
export async function runTool(
  run: () => Promise<CallToolResult>,
  onError: (error: unknown) => void
): Promise<CallToolResult> {
  try {
    return await run();
  } catch (error) {
    onError(error);
    return errorResult(describeError(error));
  }
}
