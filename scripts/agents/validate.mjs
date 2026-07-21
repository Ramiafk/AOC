#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const requiredFiles = [
  ".agents/policy.json",
  ".agents/roles.json",
  ".agents/prompts/common.md",
  ".agents/prompts/developer.md",
  ".agents/prompts/cto.md",
  ".agents/prompts/orchestrator.md",
  ".agents/prompts/specialist.md",
  "scripts/agents/runtime.mjs",
  "scripts/agents/orchestrator.mjs",
  ".github/workflows/aoc-autonomous-loop.yml",
  "docs/AUTONOMOUS_MULTI_AGENT_SYSTEM.md",
  "docs/AGENT_HANDOFF_PROTOCOL.md"
];

for (const file of requiredFiles) await access(resolve(root, file));

const policy = JSON.parse(await readFile(resolve(root, ".agents/policy.json"), "utf8"));
const roles = JSON.parse(await readFile(resolve(root, ".agents/roles.json"), "utf8"));

if (policy.mode !== "strict-sequential") throw new Error("Agent policy must remain strict-sequential");
if (policy.activeLotLimit !== 1 || policy.activePullRequestLimit !== 1) throw new Error("Only one active lot and PR are allowed");
if (!Array.isArray(roles.roles) || roles.roles.length < 10) throw new Error("The specialist team is incomplete");

const ids = roles.roles.map((role) => role.id);
if (new Set(ids).size !== ids.length) throw new Error("Agent role IDs must be unique");
for (const required of ["orchestrator", "product", "domain", "architecture", "qa", "security", "cto", "release"]) {
  if (!ids.includes(required)) throw new Error(`Missing required role: ${required}`);
}

const cto = roles.roles.find((role) => role.id === "cto");
const release = roles.roles.find((role) => role.id === "release");
if (cto.writesCode !== false || cto.canMerge !== false) throw new Error("The CTO must remain read-only and unable to merge");
if (release.canMerge !== true) throw new Error("Only the release role should perform approved merges");

for (const prompt of requiredFiles.filter((file) => file.startsWith(".agents/prompts/"))) {
  const content = await readFile(resolve(root, prompt), "utf8");
  if (!content.includes("AOC")) throw new Error(`${prompt} does not identify the AOC project`);
}

console.log(`Autonomous agent configuration valid: ${roles.roles.length} roles, strict sequential policy.`);
