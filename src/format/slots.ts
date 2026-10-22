import type { CountryCode, DeliverySlot, DeliverySlots } from "../types.js";
import { formatDate, formatDateTime, formatDay, formatPrice, formatTime } from "./prices.js";

/** A delivery slot as a tool shows it to a model. */
export type SlotOutput = {
  slotId: string;
  /** E.g. "18:00-19:00". */
  time: string;
  /** Set when it differs from the day's. */
  orderBefore?: string;
  /** Set when it differs from the day's. */
  minimumOrder?: string;
  /** Picnic's green choice: a longer window that lets Picnic plan a more efficient route. */
  greenChoice?: true;
  selected?: true;
};

/** The slots of one day. The order deadline and minimum are given once when all slots share them. */
export type SlotDayOutput = {
  /** E.g. "2026-10-23", to ask for this day. */
  date: string;
  /** E.g. "Fri 23 Oct". */
  day: string;
  orderBefore?: string;
  minimumOrder?: string;
  slots: SlotOutput[];
};

/**
 * Groups the available slots by day, in Picnic's order. The selected slot is marked, also when
 * Picnic preselected it: the slot list only flags a slot the user picked.
 */
export function slotDays(slots: DeliverySlots, countryCode: CountryCode): SlotDayOutput[] {
  const selectedId = slots.selectedSlot?.slotId ?? null;
  const byDate = new Map<string, DeliverySlot[]>();
  for (const slot of slots.slots.filter((slot) => slot.isAvailable)) {
    const date = formatDate(slot.windowStart);
    byDate.set(date, [...(byDate.get(date) ?? []), slot]);
  }
  return [...byDate].map(([date, daySlots]) =>
    formatSlotDay(date, daySlots, selectedId, countryCode)
  );
}

function formatSlotDay(
  date: string,
  slots: DeliverySlot[],
  selectedId: string | null,
  countryCode: CountryCode
): SlotDayOutput {
  const orderBefore = shared(slots.map((slot) => formatDateTime(slot.cutOffTime)));
  const minimum = shared(
    slots.map((slot) =>
      slot.minimumOrderValue === null ? "" : formatPrice(slot.minimumOrderValue, countryCode)
    )
  );
  return {
    date,
    day: formatDay(slots[0].windowStart),
    ...(orderBefore && { orderBefore }),
    ...(minimum && { minimumOrder: minimum }),
    slots: slots.map((slot) => {
      const minimumOrder =
        slot.minimumOrderValue === null ? null : formatPrice(slot.minimumOrderValue, countryCode);
      return {
        slotId: slot.slotId,
        time: `${formatTime(slot.windowStart)}-${formatTime(slot.windowEnd)}`,
        ...(!orderBefore && { orderBefore: formatDateTime(slot.cutOffTime) }),
        ...(!minimum && minimumOrder && { minimumOrder }),
        ...(slot.isGreenChoice && { greenChoice: true }),
        ...((slot.isSelected || slot.slotId === selectedId) && { selected: true }),
      };
    }),
  };
}

/** The value all items share, or null when they differ. */
function shared(values: string[]): string | null {
  return values.every((value) => value === values[0]) && values[0] ? values[0] : null;
}
