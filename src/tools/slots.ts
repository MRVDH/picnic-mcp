import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";

import { formatCartSummary } from "../format/cart.js";
import { formatWindow } from "../format/prices.js";
import { slotDays } from "../format/slots.js";
import type { ToolContext } from "./context.js";
import { errorResult, jsonResult, runTool } from "./result.js";

/** Without a date, the slots of this many days are listed. */
const DAYS_WITHOUT_DATE = 2;

export function registerSlotTools(server: McpServer, context: ToolContext): void {
  const { client, countryCode, onError } = context;

  server.registerTool(
    "get_delivery_slots",
    {
      title: "Get delivery slots",
      description:
        "List the delivery slots the user can choose for the cart. Without a date it lists the first 2 days and the dates of the other days. " +
        "Pass a date from that list to see its slots. Use select_delivery_slot once the user picked a slot.",
      inputSchema: z.object({
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-23.")
          .optional()
          .describe("The day to list, as YYYY-MM-DD. Leave out for the first days."),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ date }) =>
      runTool(async () => {
        const slots = await client.cart.getDeliverySlots();
        const days = slotDays(slots, countryCode);
        const shown = date
          ? days.filter((day) => day.date === date)
          : days.slice(0, DAYS_WITHOUT_DATE);
        const otherDays = days
          .filter((day) => !shown.includes(day))
          .map((day) => `${day.date} (${day.day})`);
        const selected = formatWindow(
          slots.selectedSlot?.windowStart ?? null,
          slots.selectedSlot?.windowEnd ?? null
        );
        return jsonResult({
          ...(date &&
            shown.length === 0 && { next: `No slots on ${date}. Pick one of otherDays.` }),
          ...(selected && { selectedWindow: selected }),
          days: shown,
          ...(otherDays.length > 0 && { otherDays }),
        });
      }, onError)
  );

  server.registerTool(
    "select_delivery_slot",
    {
      title: "Select delivery slot",
      description:
        "Choose when the cart is delivered. Only use a slotId from get_delivery_slots, after the user picked the slot. " +
        "Returns the selected delivery window and the cart total. This does not place an order.",
      inputSchema: z.object({
        slotId: z.string().trim().min(1).describe("The slotId from get_delivery_slots."),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    ({ slotId }) =>
      runTool(
        async () => {
          const cart = await client.cart.setDeliverySlot(slotId);
          if (cart.selectedSlot?.slotId !== slotId) {
            return errorResult(
              `Picnic did not select slot ${slotId}. Check the slotId with get_delivery_slots.`
            );
          }
          return jsonResult({ selected: true, cart: formatCartSummary(cart, countryCode) });
        },
        onError,
        { changesCart: true }
      )
  );
}
