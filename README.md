# picnic-mcp

An [MCP](https://modelcontextprotocol.io) server for the online supermarket [Picnic](https://picnic.app). It lets a model search Picnic's products and change your shopping cart. It can't place an order.

Unofficial: not made or supported by Picnic. Built on [picnic-api](https://github.com/MRVDH/picnic-api).

## Tools

The tools come in groups. `cart`, `slots` and `product` are on by default; turn groups on or off with `PICNIC_MCP_TOOLS` (see Setup).

| Group        | Tool                      | What it does                                                                                                                                    |
| ------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `cart`       | `search_products`         | Searches products. Returns a `bestMatch` when one product fits (usually one you bought before), or 2 or 3 `choices` to ask you about.           |
|              | `add_to_cart`             | Adds a product by its id. Returns the quantity in the cart and the cart total, and replacements when the product can't be delivered.            |
|              | `remove_from_cart`        | Removes a product by its id.                                                                                                                    |
|              | `get_cart`                | Shows the cart: products, quantities, prices, total and delivery window, and replacements for products that can't be delivered.                 |
| `slots`      | `get_delivery_slots`      | Lists the delivery slots, two days at a time or for one date.                                                                                   |
|              | `select_delivery_slot`    | Chooses the delivery slot of the cart.                                                                                                          |
| `product`    | `get_product`             | Shows a product's ingredients, allergens, nutrition, storage info, promotion and price.                                                         |
| `deliveries` | `get_deliveries`          | Shows upcoming deliveries: window, number of products, total, and the expected arrival while the driver is on the way. Optionally the products. |
| `recipes`    | `search_recipes`          | Searches Picnic's recipes.                                                                                                                      |
|              | `get_recipe`              | Shows a recipe's ingredients, allergens and steps.                                                                                              |
|              | `add_recipe_to_cart`      | Adds a recipe's ingredients to the cart for a number of portions.                                                                               |
|              | `remove_recipe_from_cart` | Removes a recipe and its ingredients from the cart.                                                                                             |

Output is compact JSON with only what a model needs. It leaves out your name, address, payment details, order numbers and other account details. Keep in mind that whatever the tools return is sent to the model your MCP client uses.

## Setup

Requires Node.js 20 or later.

### 1. Get an auth key

```bash
npx picnic-mcp login
```

It asks for your country, email and password, and the code Picnic texts you when your account uses two-factor authentication. It prints an auth key and stores nothing. Keep the key secret: it gives access to your Picnic account.

### 2. Add the server to your MCP client

Most clients take a configuration like this:

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

`PICNIC_COUNTRY_CODE` is `NL`, `DE` or `FR` (default `NL`). To choose the tool groups, add `PICNIC_MCP_TOOLS` with a comma-separated list, e.g. `"cart,slots,product,deliveries,recipes"` (default `cart,slots,product`). The server runs over stdio.

When the key expires, the tools say so; run `npx picnic-mcp login` again.

## Use it in your own code

`createServer` returns the MCP server without reading environment variables or files, so you can run it in your own process and connect it to any MCP transport:

```ts
import { createServer } from "picnic-mcp";

const server = createServer({ authKey: "<auth key>", countryCode: "NL" });
await server.connect(transport);
```

Pass `tools` to choose the tool groups (e.g. `tools: ["cart", "recipes"]`), `client` instead of `authKey` to use a picnic-api client you already have, and `onError` to handle errors from Picnic yourself (by default they're logged to stderr).

### Product images

Results that list products (search, the cart, an added product, product details) carry the image URLs of those products in `_meta["picnic-mcp/images"]`, by product id. MCP clients don't pass `_meta` to the model, so the images cost no tokens; your own code can use them, e.g. to show product photos. The images don't need the auth key. The key is exported as `IMAGES_META_KEY`.
