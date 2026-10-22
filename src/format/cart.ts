import type { Cart, CartLineItem, CountryCode } from "../types.js";
import { formatPrice, formatWindow } from "./prices.js";
import type { ProductOutput } from "./products.js";

/** A cart line as a tool shows it to a model. Optional fields are left out when empty. */
export type CartLineOutput = {
  productId: string;
  name: string;
  size?: string;
  quantity: number;
  /**
   * The price of the line, after discounts. Left out when the product can't be delivered: Picnic
   * doesn't charge it then, and shows a price of 0.
   */
  price?: string;
  labels?: string[];
  /** Why the product can't be delivered, when it can't. */
  unavailable?: string;
  /** Products Picnic offers instead, when the product can't be delivered. */
  replacements?: ProductOutput[];
};

/** The replacements of the products that can't be delivered, by product id. */
export type ReplacementsByProduct = ReadonlyMap<string, ProductOutput[]>;

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
export function formatCart(
  cart: Cart,
  countryCode: CountryCode,
  replacements: ReplacementsByProduct = new Map()
): CartOutput {
  return {
    items: cart.items.map((item) =>
      formatCartLine(item, countryCode, replacements.get(item.productId))
    ),
    ...formatCartSummary(cart, countryCode),
  };
}

export function formatCartLine(
  item: CartLineItem,
  countryCode: CountryCode,
  replacements?: ProductOutput[]
): CartLineOutput {
  const labels = item.labels.map((label) => label.text).filter(Boolean);
  return {
    productId: item.productId,
    name: item.name,
    ...(item.unitQuantity && { size: item.unitQuantity }),
    quantity: item.quantity,
    ...(!item.isUnavailable && { price: formatPrice(item.displayPrice, countryCode) }),
    ...(labels.length > 0 && { labels }),
    ...formatUnavailability(item, replacements),
  };
}

/**
 * Says why a cart line can't be delivered and what Picnic offers instead, or nothing when the line
 * can be delivered. The cart response has no usable replacement names or prices, so the
 * replacements come from `cart.getReplacements`.
 */
export function formatUnavailability(
  item: CartLineItem,
  replacements: ProductOutput[] = []
): Pick<CartLineOutput, "unavailable" | "replacements"> {
  if (!item.isUnavailable) return {};
  return {
    unavailable: item.unavailableReason ?? "not available",
    ...(replacements.length > 0 && { replacements }),
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
