# picnic-mcp

An [MCP](https://modelcontextprotocol.io) server for the online supermarket [Picnic](https://picnic.app). It lets a model search Picnic's products, fill your shopping cart, pick a delivery slot, show promotions and the products you usually buy, and use recipes. It can't place an order.

Unofficial: not made or supported by Picnic. Built on [picnic-api](https://github.com/MRVDH/picnic-api). Tested with Dutch accounts; German and French accounts should work, but haven't been tested.

## Part of a set

picnic-api, picnic-web and picnic-mcp are developed and released together. When the Picnic app changes how it gets its data, picnic-api follows it and picnic-web and picnic-mcp are updated in the same change, so their latest versions always work together.

| Project                                                                                                                                                             | What it is                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [picnic-api](https://github.com/MRVDH/picnic-api) [![npm](https://img.shields.io/npm/v/picnic-api.svg?style=flat-square)](https://www.npmjs.com/package/picnic-api) | Node.js library for Picnic's API: products, cart, delivery slots, deliveries and recipes.                                           |
| [picnic-web](https://github.com/MRVDH/picnic-web)                                                                                                                   | Web interface for Picnic, to shop from your browser. Live at [picnic.maartenvandenhoven.com](http://picnic.maartenvandenhoven.com). |
| [picnic-mcp](https://github.com/MRVDH/picnic-mcp) [![npm](https://img.shields.io/npm/v/picnic-mcp.svg?style=flat-square)](https://www.npmjs.com/package/picnic-mcp) | MCP server that lets AI assistants search products, fill your cart and pick a delivery slot.                                        |

## Tools

The tools come in groups. `cart`, `slots`, `product` and `discover` are on by default; turn groups on or off with `PICNIC_MCP_TOOLS` (see Setup).

| Group        | Tool                      | What it does                                                                                                                                                                                         |
| ------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cart`       | `search_products`         | Searches products. Returns a `bestMatch` when one product fits (usually one you bought before), or 2 or 3 `choices` to ask you about.                                                                |
|              | `add_to_cart`             | Adds one or more products by their ids. Returns the quantity of each in the cart, the products that failed, the cart total, and replacements when a product can't be delivered.                      |
|              | `set_cart_quantity`       | Sets how many of a product are in the cart; 0 removes it.                                                                                                                                            |
|              | `remove_from_cart`        | Removes a product by its id.                                                                                                                                                                         |
|              | `get_cart`                | Shows the cart: products, quantities, prices, total and delivery window, and replacements for products that can't be delivered.                                                                      |
| `slots`      | `get_delivery_slots`      | Lists the delivery slots, two days at a time or for one date.                                                                                                                                        |
|              | `select_delivery_slot`    | Chooses the delivery slot of the cart.                                                                                                                                                               |
| `product`    | `get_product`             | Shows a product's ingredients, allergens, nutrition, storage info, promotion and price.                                                                                                              |
| `discover`   | `get_promotions`          | Lists this week's promotions per section (e.g. per category), all promotions of a section, or the products of one promotion.                                                                         |
|              | `get_favorites`           | Lists the products you buy, per aisle, as the app's "Favorieten" tab does. For "add my usual groceries".                                                                                             |
| `deliveries` | `get_deliveries`          | Shows upcoming deliveries (window, number of products, total, and the expected arrival while the driver is on the way) or the last past ones. Optionally the products, e.g. to order the same again. |
| `recipes`    | `search_recipes`          | Searches Picnic's recipes.                                                                                                                                                                           |
|              | `get_saved_recipes`       | Lists the recipes you saved in the app.                                                                                                                                                              |
|              | `get_recipe`              | Shows a recipe's ingredients, allergens and steps. The recipe tools also take a recipe link shared from the Picnic app.                                                                              |
|              | `add_recipe_to_cart`      | Adds a recipe's ingredients to the cart for a number of portions.                                                                                                                                    |
|              | `remove_recipe_from_cart` | Removes a recipe and its ingredients from the cart.                                                                                                                                                  |
|              | `save_recipe`             | Saves a recipe in the app.                                                                                                                                                                           |
|              | `unsave_recipe`           | Removes a recipe from your saved recipes.                                                                                                                                                            |

Output is compact JSON with only what a model needs. It leaves out your name, address, payment details, order numbers and other account details. Keep in mind that whatever the tools return is sent to the model your MCP client uses.

When a search has no clear match and your MCP client can show a form ([elicitation](https://modelcontextprotocol.io/specification/latest/client/elicitation)), you pick the product in the client yourself, instead of the model asking you in the chat.

## Setup

Requires Node.js 20 or later.

### 1. Get an auth key

```bash
npx picnic-mcp login
```

It asks for your country, email and password, and the code Picnic texts you when your account uses two-factor authentication. It prints an auth key and stores nothing. Keep the key secret: it gives access to your Picnic account.

### 2. Add the server to your MCP client

**Claude Desktop and other MCPB clients:** download `picnic-mcp.mcpb` from the [latest release](https://github.com/MRVDH/picnic-mcp/releases/latest), open it, and fill in the auth key.

**Other clients** take a configuration like this:

```json
{
  "mcpServers": {
    "picnic": {
      "command": "npx",
      "args": ["-y", "picnic-mcp"],
      "env": {
        "PICNIC_AUTH_KEY": "<your auth key>",
        "PICNIC_COUNTRY_CODE": "NL"
      }
    }
  }
}
```

`PICNIC_COUNTRY_CODE` is `NL`, `DE` or `FR` (default `NL`). To choose the tool groups, add `PICNIC_MCP_TOOLS` with a comma-separated list, e.g. `"cart,slots,product,discover,deliveries,recipes"` (default `cart,slots,product,discover`). Fewer tools help smaller models pick the right one. The server runs over stdio; see [HTTP](#http) to reach it over the network.

The server is also listed in the [MCP Registry](https://registry.modelcontextprotocol.io) as `io.github.MRVDH/picnic-mcp`.

When the key expires, the tools say so; run `npx picnic-mcp login` again.

## HTTP

`picnic-mcp http` serves the same tools over HTTP at `/mcp`, for clients that connect to a URL. It needs a token that clients send as `Authorization: Bearer <token>`; generate one with:

```bash
openssl rand -hex 32
```

```bash
PICNIC_AUTH_KEY=<auth key> PICNIC_MCP_HTTP_TOKEN=<token> npx picnic-mcp http
```

| Variable                        |                                                                                                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PICNIC_MCP_HTTP_TOKEN`         | Required, at least 32 characters. Anyone with it can change your cart, so keep it secret.                                                                        |
| `PICNIC_MCP_HTTP_HOST`          | Address to listen on. Default `127.0.0.1`, so only this machine can connect.                                                                                     |
| `PICNIC_MCP_HTTP_PORT`          | Default `3000`.                                                                                                                                                  |
| `PICNIC_MCP_HTTP_ALLOWED_HOSTS` | Host names allowed besides localhost, comma-separated, e.g. the name of a reverse proxy in front of it. Requests with another Host or Origin header are refused. |

The server doesn't do HTTPS. To use it from another machine, put it behind a reverse proxy with HTTPS, and add the proxy's host name to `PICNIC_MCP_HTTP_ALLOWED_HOSTS`.

## Use it in your own code

`createServer` returns the MCP server without reading environment variables or files, so you can run it in your own process and connect it to any MCP transport:

```ts
import { createServer } from "picnic-mcp";

const server = createServer({ authKey: "<auth key>", countryCode: "NL" });
await server.connect(transport);
```

Pass `tools` to choose the tool groups (e.g. `tools: ["cart", "recipes"]`), `client` instead of `authKey` to use a picnic-api client you already have, and `onError` to handle errors from Picnic yourself (by default they're logged to stderr).

### Product images

Results that list products (search, the cart, added products, promotions, favorites, product details) carry the image URLs of those products in `_meta["picnic-mcp/images"]`, by product id. MCP clients don't pass `_meta` to the model, so the images cost no tokens; your own code can use them, e.g. to show product photos. The images don't need the auth key. The key is exported as `IMAGES_META_KEY`.
