# Agent Instructions

picnic-mcp is an MCP server for the online supermarket Picnic, built on
[picnic-api](https://github.com/MRVDH/picnic-api). It lets a model search products and change the
cart. It never places an order.

## Structure

```
src/
  index.ts          # public exports: createServer and the output types
  server.ts         # createServer(): the McpServer with the tools registered
  cli.ts            # the `picnic-mcp` bin: stdio server, and `login` to print an auth key
  types.ts          # CountryCode and aliases for picnic-api's models
  match.ts          # picks a best match or choices from search results
  errors.ts         # picnic-api errors -> short messages for the model
  tools/            # one file per tool group: schema, description, handler
  format/           # model-facing output, built from an allow-list of fields
test/               # vitest, with made-up fixtures
```

## Where code goes

- picnic-mcp only defines tools and shapes their output for a model. Parsing Picnic's responses and
  pages, and other knowledge of Picnic's data, belongs in picnic-api. When a tool needs data that
  picnic-api doesn't return yet, add it to picnic-api first.
- `createServer` reads no environment variables or files and starts no transport, so it can run in
  another process's code. Environment variables and stdio belong in `cli.ts`.
- The package is about itself: don't name specific MCP clients, consumers or model providers in
  code, docs or tool descriptions.

## Tools

- Write names, descriptions and output for models that are weak at tool use: one job per tool, a
  description that says when to use it and what comes back, and input that rejects obvious mistakes
  (a product name where an id is expected) before calling Picnic.
- Return compact JSON text: only the fields a model needs, prices formatted per country, ids for the
  next call, and a `next` hint when the model has to decide something.
- Build output from an allow-list in `format/`, never by spreading a picnic-api model, so new fields
  in picnic-api don't reach the model unnoticed.
- Read-only tools get `readOnlyHint: true`. No tool may start a checkout or place an order.

## Product matching

`search_products` treats a product as bought before when it is in the search results' section with
type `"RFY"` ("Opnieuw bestellen"). A tile's `numberOfOrders` is not a per-product count: Picnic
sends the same value on every tile. One available product bought before is the best match; several
are offered as choices; without any, the first results are offered.

## Personal data

The repo is public, including its history and pull requests.

- Tool output leaves out the account's name, address, email, phone number, order numbers and other
  account details. The cart id and timestamp stay out too.
- Never copy real account data into code, tests, fixtures, commit messages or pull requests. Use
  made-up products and placeholders, and describe live tests in general terms.

## Testing

- `npm run typecheck`, `npm test` and `npm run build`. Format with `npm run format`.
- Against the live API, send GET requests only, unless the user approves a mutation. Adding to or
  removing from the cart is a mutation. A search reads only, but it runs a server action with a
  POST. Pace requests: Picnic blocks the client for about 10 minutes after a few hundred requests in
  quick succession.
- Try the built server with MCP Inspector's CLI:
  `npx @modelcontextprotocol/inspector --cli node dist/cli.js -e PICNIC_AUTH_KEY=<key> --method tools/list`.
- To test against an unreleased picnic-api, run `npm pack --pack-destination /tmp` in picnic-api and
  `npm install --no-save /tmp/picnic-api-<version>.tgz` here.

Don't bump the version or publish unless asked.
