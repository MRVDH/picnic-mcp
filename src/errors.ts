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
  if (PicnicClient.isUnexpectedPageFormatError(error)) {
    return "Picnic changed the format of a page this server reads. Update picnic-mcp, or report it if this is the latest version.";
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return "Picnic did not answer in time. Try again.";
  }
  return "Could not reach Picnic. Try again later.";
}
