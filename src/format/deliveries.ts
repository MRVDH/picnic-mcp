import type { CountryCode, Delivery, DeliveryPosition, DeliverySummary } from "../types.js";
import { type CartLineOutput, formatCartLine } from "./cart.js";
import { formatPrice, formatTime, formatWindow } from "./prices.js";

/**
 * An upcoming delivery as a tool shows it to a model. Delivery and order ids, payment details, the
 * driver, the address and the route stay out.
 */
export type DeliveryOutput = {
  /** The delivery window, e.g. "Thu 23 Oct, 18:00-19:00". */
  window?: string;
  itemCount: number;
  total: string;
  /** Set when the driver is on the way. */
  onTheWay?: true;
  /** The expected arrival, e.g. "18:12-18:32", while the driver is on the way. */
  expectedArrival?: string;
  products?: CartLineOutput[];
};

export function formatDelivery(
  summary: DeliverySummary,
  position: DeliveryPosition | null,
  delivery: Delivery | null,
  countryCode: CountryCode
): DeliveryOutput {
  const window = formatWindow(summary.windowStart, summary.windowEnd);
  const arrival = position?.inProgress ? expectedArrival(position) : null;
  return {
    ...(window && { window }),
    itemCount: summary.itemCount,
    total: formatPrice(summary.totalPrice, countryCode),
    ...(position?.inProgress && { onTheWay: true }),
    ...(arrival && { expectedArrival: arrival }),
    ...(delivery && {
      products: delivery.orders.flatMap((order) =>
        order.items.map((item) => formatCartLine(item, countryCode))
      ),
    }),
  };
}

function expectedArrival(position: DeliveryPosition): string | null {
  if (position.etaWindowStart && position.etaWindowEnd) {
    return `${formatTime(position.etaWindowStart)}-${formatTime(position.etaWindowEnd)}`;
  }
  return position.eta === null ? null : formatTime(new Date(position.eta).toISOString());
}
