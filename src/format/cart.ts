import type { Cart, CartLineItem, CountryCode } from "../types.js";
import { formatPrice, formatWindow } from "./prices.js";

/** A cart line as a tool shows it to a model. Optional fields are left out when empty. */
export type CartLineOutput = {
  productId: string;
  name: string;
  size?: string;
  quantity: number;
  /** The price of the line, after discounts. */
  price: string;
  labels?: string[];
  /** Why the product can't be delivered, when it can't. */
  unavailable?: string;
};

/** The totals of the cart. */
export type CartSummaryOutput = {
  itemCount: number;
  /** The amount to pay, including deposits and fees. */
  total: string;
  savings?: string;
  deliveryWindow?: string;
  /** The minimum order value of the selected delivery slot. */
  minimumOrder?: string;
};

export type CartOutput = CartSummaryOutput & { items: CartLineOutput[] };

/**
 * Builds the model-facing cart from an allow-list of fields. The cart id, its timestamp, images
 * and other fields a model doesn't need stay out, as do fields picnic-api adds later.
 */
export function formatCart(cart: Cart, countryCode: CountryCode): CartOutput {
  return {
    items: cart.items.map((item) => formatCartLine(item, countryCode)),
    ...formatCartSummary(cart, countryCode),
  };
}

export function formatCartLine(item: CartLineItem, countryCode: CountryCode): CartLineOutput {
  const labels = item.labels.map((label) => label.text).filter(Boolean);
  return {
    productId: item.productId,
    name: item.name,
    ...(item.unitQuantity && { size: item.unitQuantity }),
    quantity: item.quantity,
    price: formatPrice(item.displayPrice, countryCode),
    ...(labels.length > 0 && { labels }),
    ...(item.isUnavailable && { unavailable: item.unavailableReason ?? "not available" }),
  };
}

export function formatCartSummary(cart: Cart, countryCode: CountryCode): CartSummaryOutput {
  const savings = cart.promotionSavings + cart.membershipSavings;
  const window = formatWindow(
    cart.selectedSlot?.windowStart ?? null,
    cart.selectedSlot?.windowEnd ?? null
  );
  return {
    itemCount: cart.totalCount,
    total: formatPrice(cart.totalPrice, countryCode),
    ...(savings > 0 && { savings: formatPrice(savings, countryCode) }),
    ...(window && { deliveryWindow: window }),
    ...(cart.minimumOrderValue !== null && {
      minimumOrder: formatPrice(cart.minimumOrderValue, countryCode),
    }),
  };
}
