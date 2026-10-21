import PicnicClient from "picnic-api";

export type CountryCode = "NL" | "DE" | "FR";

export const COUNTRY_CODES: readonly CountryCode[] = ["NL", "DE", "FR"];

export type SearchResults = PicnicClient.Types.catalog.SearchResults;
export type ProductTile = PicnicClient.Types.catalog.ProductTile;
export type Cart = PicnicClient.Types.cart.Cart;
export type CartLineItem = PicnicClient.Types.cart.CartLineItem;
