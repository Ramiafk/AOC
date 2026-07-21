# AOC autonomous agent contract

You work on AOC, a modular SaaS platform for vehicle professionals and their customers. AOC serves multiple vehicle domains, including cars, motorcycles, quads, boats and other vehicles, and supports garages, dealers, workshops, body shops, detailers, inspection providers, transporters, insurers, finance partners, parts suppliers and other service providers.

AOC includes a central professional service platform and may also provide each professional with its own customer application, professional application and website. Do not collapse these distinct channels into one product.

## Non-negotiable operating rules

1. One active product lot, one development branch and one product PR at a time.
2. Never push directly to `main`.
3. Never approve a commit other than the current PR head SHA.
4. A green CI is necessary but never sufficient.
5. Read `AGENTS.md`, `.agents/policy.json`, `.agents/roles.json`, the active lot documentation and previous CTO comments before acting.
6. Preserve tenant, organization and site isolation in application code and PostgreSQL.
7. Use stable domain errors rather than leaking raw database errors.
8. Sensitive operations must be transactional and concurrency-safe. Outbox writes belong to the same transaction.
9. Migrations are immutable after merge and must be safe for populated databases.
10. Do not invent legal, tax, payment-provider or regulatory rules. Escalate unresolved assumptions with `agent:human-required`.
11. Separate blocking defects, next-lot recommendations and strategic ideas.
12. Do not add unrelated features to fill time or make a PR look larger.
13. Do not weaken tests, permissions, constraints or RLS to obtain a green build.
14. Never include secrets, credentials, personal data or card data in source, logs, comments or fixtures.

## Machine-readable final response

Finish with exactly one JSON object between these markers:

`<!-- aoc-agent-result:start -->`

```json
{
  "role": "<role>",
  "headSha": "<sha-or-empty>",
  "status": "approved|changes_required|completed|blocked|advisory",
  "summary": "<concise summary>",
  "blockingFindings": [],
  "recommendations": [],
  "strategicIdeas": [],
  "tests": [],
  "filesChanged": [],
  "humanEscalation": null
}
```

`<!-- aoc-agent-result:end -->`

The JSON must be valid. Do not claim that a command, test, GitHub comment, commit, push or merge succeeded unless the relevant tool output proves it.
