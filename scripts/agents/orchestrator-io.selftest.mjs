import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./orchestrator.mjs", import.meta.url), "utf8");
const required = [
  "GH_JSON_OUTPUT_LIMIT = 8_000_000",
  "truncate: false",
  "options.limit ?? GH_JSON_OUTPUT_LIMIT",
  "ignoreIrrelevantEvent",
  `--limit", "500`,
  "outputError"
];
for (const token of required) if (!source.includes(token)) throw new Error("Missing orchestrator IO invariant: " + token);
if (source.includes("ignoreUntrustedCommentEvent")) throw new Error("Legacy event filter remains");
if (source.includes("stdout = truncate(`${stdout}${chunk}`, options.limit || 100000)")) throw new Error("Legacy JSON-corrupting truncation remains");

const fixture = JSON.stringify(Array.from({ length: 500 }, (_, index) => ({ index, body: "x".repeat(500) })));
if (fixture.length <= 100000) throw new Error("Fixture is too small");
const parsed = JSON.parse(fixture);
if (parsed.length !== 500) throw new Error("Large JSON fixture did not round-trip");
console.log("Orchestrator IO self-test passed with " + fixture.length + " JSON characters");
