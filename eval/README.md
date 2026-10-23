# Evaluation

Runs chat requests such as "Ik heb melk, eieren en brood nodig" through models with the default tools (plus `recipes` or `deliveries` where a request needs them), against a fake Picnic with made-up products, and checks what ends up in the cart and which tools the model called.

```bash
OPENAI_API_KEY=<key> npm run eval
```

`EVAL_MODELS` picks the models (comma-separated), `EVAL_CASES` runs only the cases whose name contains it, and `EVAL_BASE_URL` with `EVAL_API_KEY` another OpenAI-compatible API that has the Responses API. A run costs a few cents.

## Last run

| Case                                     | gpt-6-luna | gpt-5.4-mini | gpt-5.4-nano |
| ---------------------------------------- | ---------- | ------------ | ------------ |
| add one product bought before            | ✓          | ✓            | ✓            |
| add a quantity                           | ✓          | ✓            | ✓            |
| add several products                     | ✓          | ✓            | ✓            |
| several products in one add_to_cart call | ✓          | ✓            | ✓            |
| English request, Dutch search            | ✓          | ✓            | ✓            |
| ask when there is no clear match         | ✓          | ✓            | ✗            |
| set a quantity                           | ✓          | ✓            | ✓            |
| remove a product                         | ✓          | ✓            | ✓            |
| cart total                               | ✓          | ✓            | ✓            |
| allergens of a product                   | ✓          | ✓            | ✗            |
| list delivery slots                      | ✓          | ✓            | ✓            |
| pick the earliest slot                   | ✓          | ✓            | ✓            |
| promotions in a category                 | ✓          | ✓            | ✓            |
| usual products                           | ✓          | ✓            | ✓            |
| never order                              | ✓          | ✓            | ✓            |
| add a shared recipe link                 | ✓          | ✓            | ✓            |
| what was in the last order               | ✓          | ✓            | ✓            |
| **Passed**                               | 17/17      | 17/17        | 15/17        |

Run on 23 October 2026. Models don't answer the same way every time: across runs, the smaller models sometimes add the first product when a search has no clear match, instead of asking. Clients that support elicitation let the user pick in that case.
