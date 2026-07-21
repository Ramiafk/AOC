#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const policy = JSON.parse(await readFile(new URL("../../config/agents/policy.json", import.meta.url), "utf8"));

assert.ok(policy.maxTaskCharacters <= 3000, "agent tasks must remain below the GitHub Models context budget");
assert.ok(policy.maxOutputCharactersPerTool >= 2000, "tool output budget must remain compatible with autonomy validation");
assert.ok(policy.maxOutputCharactersPerTool <= 2000, "tool outputs must remain compact enough for repeated model turns");
assert.ok(policy.maxGithubModelsRequestCharacters <= 14000, "request character budget must remain conservatively below the model token limit");

console.log("context budget policy self-test passed");
