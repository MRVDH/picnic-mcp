import PicnicClient from "picnic-api";

/**
 * Turns an error from picnic-api into a short message for the model. Response bodies stay out:
 * they can be long HTML pages or contain account data.
 */
export function describeError(error: unknown): string {
  if (PicnicClient.isPicnicApiError(error)) {
    // Throttling comes from the edge in front of Picnic's API as a 403 with an HTML page.
    if (/<html[\s>]/i.test(error.body)) {
      return "Picnic is rate limiting this client. Try again in a few minutes.";
    }
    if (error.status === 401 || error.status === 403) {
      return "The Picnic auth key is invalid or expired. Get a new one with `npx picnic-mcp login` and update PICNIC_AUTH_KEY.";
    }
    return `Picnic answered with HTTP ${error.status}${error.code ? ` (${error.code})` : ""}.`;
  }
  if (PicnicClient.isProductNotFoundError(error)) {
    return `Product ${error.productId} doesn't exist or isn't available here. Check the product id with search_products.`;
  }
  if (PicnicClient.isUnexpectedPageFormatError(error)) {
    return "Picnic changed the format of a page this server reads. Update picnic-mcp, or report it if this is the latest version.";
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return "Picnic did not answer in time. Try again.";
  }
  return "Could not reach Picnic. Try again later.";
}

/** Added to an error of a tool that changes the cart, when the change may have happened anyway. */
export const CART_MAY_HAVE_CHANGED =
  "The cart may have changed anyway: check get_cart before trying again.";

/**
 * Whether a failed cart change may still have gone through: after a timeout, a network error or a
 * server error the request may have reached Picnic. Not when Picnic rejected it (a 4xx, the auth
 * key, rate limiting) or it failed before anything was sent.
 */
export function mayHaveChangedCart(error: unknown): boolean {
  if (PicnicClient.isPicnicApiError(error))
    return error.status >= 500 && !/<html[\s>]/i.test(error.body);
  if (
    PicnicClient.isProductNotFoundError(error) ||
    PicnicClient.isUnexpectedPageFormatError(error)
  ) {
    return false;
  }
  return true;
}
