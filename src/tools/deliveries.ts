import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";

import { formatDelivery } from "../format/deliveries.js";
import type { DeliverySummary } from "../types.js";
import type { ToolContext } from "./context.js";
import { jsonResult, runTool } from "./result.js";

/** At most this many upcoming deliveries are shown, each costing one or two requests. */
const MAX_DELIVERIES = 3;

export function registerDeliveryTools(server: McpServer, context: ToolContext): void {
  const { client, countryCode, onError } = context;

  server.registerTool(
    "get_deliveries",
    {
      title: "Get upcoming deliveries",
      description:
        "Show the user's upcoming Picnic deliveries: the delivery window, the number of products and the total, " +
        "and the expected arrival time when the driver is on the way. Set includeProducts to also list what was ordered.",
      inputSchema: z.object({
        includeProducts: z
          .boolean()
          .default(false)
          .describe("Also list the products of each delivery. Default false."),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ includeProducts }) =>
      runTool(async () => {
        const summaries = (await client.delivery.getDeliverySummaries(["CURRENT"]))
          .sort(byWindowStart)
          .slice(0, MAX_DELIVERIES);
        if (summaries.length === 0) {
          return jsonResult({ next: "The user has no upcoming deliveries.", deliveries: [] });
        }
        const deliveries = await Promise.all(
          summaries.map(async (summary) => {
            const [position, delivery] = await Promise.all([
              // A delivery that hasn't left yet may have no position; that only hides the arrival time.
              client.delivery.getDeliveryPosition(summary.id).catch(() => null),
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
