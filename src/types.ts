import PicnicClient from "picnic-api";

export type CountryCode = "NL" | "DE" | "FR";

export const COUNTRY_CODES: readonly CountryCode[] = ["NL", "DE", "FR"];

export type SearchResults = PicnicClient.Types.catalog.SearchResults;
export type ProductTile = PicnicClient.Types.catalog.ProductTile;
export type SearchRecipe = PicnicClient.Types.catalog.SearchRecipe;
export type Product = PicnicClient.Types.catalog.Product;
export type Cart = PicnicClient.Types.cart.Cart;
export type CartLineItem = PicnicClient.Types.cart.CartLineItem;
export type DeliverySlots = PicnicClient.Types.cart.DeliverySlots;
export type DeliverySlot = PicnicClient.Types.cart.DeliverySlot;
export type DeliverySummary = PicnicClient.Types.delivery.DeliverySummary;
export type Delivery = PicnicClient.Types.delivery.Delivery;
export type DeliveryPosition = PicnicClient.Types.delivery.DeliveryPosition;
export type Recipe = PicnicClient.Types.recipe.Recipe;
