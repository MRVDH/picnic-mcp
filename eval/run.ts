// Runs the evaluation cases against real models and a fake Picnic, and prints a results table.
//
//   OPENAI_API_KEY=... npm run eval
//
// EVAL_MODELS picks the models (comma-separated), EVAL_BASE_URL another OpenAI-compatible API with
// the Responses API, EVAL_API_KEY its key, and EVAL_CASES runs only the cases whose id contains it.
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";

import { DEFAULT_TOOL_GROUPS, createServer } from "../src/index.js";
import { CASES, type Case, type ToolCall } from "./cases.js";
import { fakePicnic } from "./fake-picnic.js";

const MODELS = (process.env.EVAL_MODELS ?? "gpt-6-luna,gpt-5.4-mini,gpt-5.4-nano")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);
const BASE_URL = (process.env.EVAL_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
const API_KEY = process.env.EVAL_API_KEY ?? process.env.OPENAI_API_KEY;
const ONLY = process.env.EVAL_CASES?.toLowerCase();

/** The model gets at most this many rounds of tool calls per message, as in a chat app. */
const MAX_ROUNDS = 8;

/** Short instructions such as a chat app gives; what the tools need is in their descriptions. */
const INSTRUCTIONS = `You help the user with their groceries at the online supermarket Picnic, through the Picnic tools.
- Reply in the language the user writes in, and keep replies short.
- Follow the "next" hints in the tool results.
- Never say an order was placed: these tools can change the cart, but can't order.`;

type ResponseItem = {
  type: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  content?: { type: string; text?: string }[];
};
type ModelResponse = { id: string; output: ResponseItem[]; usage?: { total_tokens?: number } };

async function createResponse(body: Record<string, unknown>): Promise<ModelResponse> {
  const response = await fetch(`${BASE_URL}/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return (await response.json()) as ModelResponse;
}

function parseArguments(json: string | undefined): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(json || "{}");
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Runs one case with one model: a chat of one user message, with the tools of the case. */
async function runCase(model: string, testCase: Case) {
  const picnic = fakePicnic(testCase.cart);
  const server = createServer({
    client: picnic.client,
    tools: testCase.tools ?? DEFAULT_TOOL_GROUPS,
    onError: () => {},
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "picnic-mcp-eval", version: "1.0.0" });
  await client.connect(clientTransport);

  try {
    const { tools } = await client.listTools();
    const definitions = tools.map((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
      strict: false,
    }));
    const calls: ToolCall[] = [];
    let tokens = 0;
    const create = async (input: unknown[], previous?: string) => {
      const response = await createResponse({
        model,
        instructions: INSTRUCTIONS,
        input,
        tools: definitions,
        previous_response_id: previous,
        store: true,
      });
      tokens += response.usage?.total_tokens ?? 0;
      return response;
    };

    let response = await create([{ role: "user", content: testCase.message }]);
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const requested = response.output.filter((item) => item.type === "function_call");
      if (requested.length === 0) break;
      const outputs = [];
      for (const item of requested) {
        const args = parseArguments(item.arguments);
        const result = await client.callTool({ name: item.name!, arguments: args });
        const text = (result.content as { type: string; text?: string }[])
          .map((part) => part.text ?? "")
          .join("\n");
        calls.push({ name: item.name!, args, isError: result.isError === true });
        outputs.push({ type: "function_call_output", call_id: item.call_id, output: text });
      }
      response = await create(outputs, response.id);
    }
    const text = response.output
      .filter((item) => item.type === "message")
      .flatMap((item) => item.content ?? [])
      .map((part) => part.text ?? "")
      .join("\n");

    const failure = testCase.check({ calls, text, picnic });
    return { failure, calls, text, tokens };
  } finally {
    await client.close();
  }
}

async function main() {
  if (!API_KEY) {
    console.error("Set OPENAI_API_KEY, or EVAL_API_KEY for another API.");
    process.exit(1);
  }
  const cases = CASES.filter((testCase) => !ONLY || testCase.id.toLowerCase().includes(ONLY));
  const results = new Map<string, Map<string, string | null>>();
  const totals = new Map<string, { passed: number; tokens: number }>();

  for (const model of MODELS) {
    const byCase = new Map<string, string | null>();
    let passed = 0;
    let tokens = 0;
    for (const testCase of cases) {
      let failure: string | null;
      try {
        const outcome = await runCase(model, testCase);
        failure = outcome.failure;
        tokens += outcome.tokens;
        const tools =
          outcome.calls.map((call) => `${call.name}(${JSON.stringify(call.args)})`).join(" > ") ||
          "no tools";
        const answer = outcome.text.replace(/\s+/g, " ").slice(0, 200);
        console.error(
          `${failure ? "FAIL" : "pass"}  ${model}  ${testCase.id}  ${failure ? `(${tools}): ${failure}. Answer: ${answer}` : ""}`
        );
      } catch (error) {
        failure = `error: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`;
        console.error(`ERR   ${model}  ${testCase.id}: ${failure}`);
      }
      if (!failure) passed++;
      byCase.set(testCase.id, failure);
    }
    results.set(model, byCase);
    totals.set(model, { passed, tokens });
  }

  // A Markdown table for the README: one row per case, one column per model.
  const header = `| Case | ${MODELS.join(" | ")} |`;
  const divider = `|---|${MODELS.map(() => "---").join("|")}|`;
  const rows = cases.map(
    (testCase) =>
      `| ${testCase.id} | ${MODELS.map((model) => (results.get(model)!.get(testCase.id) ? "✗" : "✓")).join(" | ")} |`
  );
  const total = `| **Passed** | ${MODELS.map((model) => `${totals.get(model)!.passed}/${cases.length}`).join(" | ")} |`;
  console.log([header, divider, ...rows, total].join("\n"));
  console.log(
    `\nTokens: ${MODELS.map((model) => `${model} ${totals.get(model)!.tokens}`).join(", ")}. ${new Date().toISOString().slice(0, 10)}.`
  );
}

await main();
