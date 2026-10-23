import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";

import { formatDelivery } from "../format/deliveries.js";
import type { DeliverySummary } from "../types.js";
import type { ToolContext } from "./context.js";
import { jsonResult, runTool } from "./result.js";

/** At most this many deliveries are shown, each costing one or two requests. */
const MAX_DELIVERIES = 3;

export function registerDeliveryTools(server: McpServer, context: ToolContext): void {
  const { client, countryCode, onError } = context;

  server.registerTool(
    "get_deliveries",
    {
      title: "Get deliveries",
      description:
        'Show the user\'s Picnic deliveries: upcoming ones (the default), or the last past ones with when: "past". ' +
        "Each has the delivery window, the number of products and the total; an upcoming one also has the expected arrival while the driver is on the way. " +
        "Set includeProducts to list what was ordered, e.g. to order the same again: show the products and add the ones the user wants with add_to_cart.",
      inputSchema: z.object({
        when: z
          .enum(["upcoming", "past"])
          .default("upcoming")
          .describe(
            '"upcoming" for deliveries still to come, "past" for the last delivered ones. Default upcoming.'
          ),
        includeProducts: z
          .boolean()
          .default(false)
          .describe("Also list the products of each delivery. Default false."),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ when, includeProducts }) =>
      runTool(async () => {
        const past = when === "past";
        const summaries = (
          await client.delivery.getDeliverySummaries([past ? "COMPLETED" : "CURRENT"])
        )
          .sort((a, b) => (past ? byWindowStart(b, a) : byWindowStart(a, b)))
          .slice(0, MAX_DELIVERIES);
        if (summaries.length === 0) {
          return jsonResult({
            next: past
              ? "The user has no past deliveries."
              : "The user has no upcoming deliveries.",
            deliveries: [],
          });
        }
        const deliveries = await Promise.all(
          summaries.map(async (summary) => {
            const [position, delivery] = await Promise.all([
              // Only an upcoming delivery has a position. One that hasn't left yet may have none;
              // that only hides the arrival time.
              past ? null : client.delivery.getDeliveryPosition(summary.id).catch(() => null),
              includeProducts ? client.delivery.getDelivery(summary.id) : null,
            ]);
            return formatDelivery(summary, position, delivery, countryCode);
          })
        );
        return jsonResult({ deliveries });
      }, onError)
  );
}

function byWindowStart(a: DeliverySummary, b: DeliverySummary): number {
  return (a.windowStart ?? "").localeCompare(b.windowStart ?? "");
}
