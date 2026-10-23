/** Picnic's web hosts. A shared recipe link starts and ends on one of them. */
const PICNIC_HOSTS = ["picnic.app", "www.picnic.app"];

/** A recipe id: 24 hex characters for Picnic's recipes, 32 for the user's own. */
const RECIPE_ID = "[a-f0-9]{24}(?:[a-f0-9]{8})?";

/** The recipe id in a recipe page URL: in the path (`/nl/recepten/<id>`) or a `selling_group_id=` parameter. */
const ID_IN_URL = new RegExp(`(?:/|selling_group_id=)(${RECIPE_ID})(?=$|[/?#,&;])`, "i");

/** Following a short link takes a few redirects; give up when Picnic doesn't answer in time. */
const TIMEOUT_MS = 10_000;

/**
 * Turns the recipeId a tool got into a recipe id. Text that isn't a URL is passed on as an id. A
 * picnic.app link, as the app's share button makes them (`https://picnic.app/nl/go/<code>`), is
 * followed through its redirects to the recipe page, whose URL has the id; this needs no auth key,
 * so none is sent. Returns null for a link to another site or to a page that isn't a recipe.
 */
export async function resolveRecipeLink(
  input: string,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  const text = input.trim();
  const url = parseUrl(text);
  if (!url) return text;
  if (!isPicnicUrl(url)) return null;

  const direct = recipeIdIn(url);
  if (direct) return direct;

  const response = await fetchImpl(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  await response.body?.cancel();
  const final = parseUrl(response.url);
  return final && isPicnicUrl(final) ? recipeIdIn(final) : null;
}

function parseUrl(text: string): URL | null {
  try {
    return new URL(text);
  } catch {
    return null;
  }
}

function isPicnicUrl(url: URL): boolean {
  return url.protocol === "https:" && PICNIC_HOSTS.includes(url.hostname.toLowerCase());
}

function recipeIdIn(url: URL): string | null {
  let href = url.href;
  try {
    // The page's deeplink comes percent-encoded in a query parameter.
    href = decodeURIComponent(href);
  } catch {
    // Keep the URL as it is when it isn't valid percent-encoding.
  }
  return ID_IN_URL.exec(href)?.[1].toLowerCase() ?? null;
}
