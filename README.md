# picnic-mcp

An [MCP](https://modelcontextprotocol.io) server for the online supermarket [Picnic](https://picnic.app). It lets a model search Picnic's products and change your shopping cart. It can't place an order.

Unofficial: not made or supported by Picnic. Built on [picnic-api](https://github.com/MRVDH/picnic-api).

## Tools

| Tool               | What it does                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `search_products`  | Searches products. Returns a `bestMatch` when one product fits (usually one you bought before), or 2 or 3 `choices` to ask you about. |
| `add_to_cart`      | Adds a product by its id. Returns the quantity in the cart and the cart total.                                                        |
| `remove_from_cart` | Removes a product by its id.                                                                                                          |
| `get_cart`         | Shows the cart: products, quantities, prices, total and delivery window.                                                              |

Output is compact JSON with only what a model needs. It contains products, prices and your cart, but not your name, address or other account details. Keep in mind that whatever the tools return is sent to the model your MCP client uses.

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

`PICNIC_COUNTRY_CODE` is `NL`, `DE` or `FR` (default `NL`). The server runs over stdio.

When the key expires, the tools say so; run `npx picnic-mcp login` again.

## Use it in your own code

`createServer` returns the MCP server without reading environment variables or files, so you can run it in your own process and connect it to any MCP transport:

```ts
import { createServer } from "picnic-mcp";

const server = createServer({ authKey: "<auth key>", countryCode: "NL" });
await server.connect(transport);
```

Pass `client` instead of `authKey` to use a picnic-api client you already have, and `onError` to handle errors from Picnic yourself (by default they're logged to stderr).

## Requests

A cart tool sends one request to Picnic, a search two (a few more on the first search, to load the search page's code). Picnic blocks a client for a few minutes after a few hundred requests in quick succession; the tools then return a message saying so.

## License

MIT
