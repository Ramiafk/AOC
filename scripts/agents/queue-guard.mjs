#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile, appendFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO = process.env.GITHUB_REPOSITORY;
const EVENT_NAME = process.env.GITHUB_EVENT_NAME;
const EVENT_PATH = process.env.GITHUB_EVENT_PATH;
const OUTPUT = process.env.GITHUB_OUTPUT;

async function ghJson(args) {
  const { stdout } = await execFileAsync("gh", args, { env: process.env, maxBuffer: 8 * 1024 * 1024 });
  return stdout.trim() ? JSON.parse(stdout) : null;
}

async function setOutput(name, value) {
  if (OUTPUT) await appendFile(OUTPUT, `${name}=${String(value)}\n`, "utf8");
}

export function decideQueueGuard({ eventName, event, activeIssueCount, activePrBranches }) {
  if (["push", "workflow_dispatch"].includes(eventName)) return { proceed: true, reason: eventName };
  if (eventName === "issue_comment") return { proceed: true, reason: "trusted-command" };
  if (eventName === "issues") {
    return event?.label?.name === "agent:ready"
      ? { proceed: true, reason: "lot-ready" }
      : { proceed: false, reason: "irrelevant-label" };
  }
  if (eventName === "schedule") {
    return activeIssueCount > 0
      ? { proceed: false, reason: "active-lot-owned-by-existing-run" }
      : { proceed: true, reason: "hourly-recovery" };
  }
  if (eventName === "workflow_run") {
    const branch = String(event?.workflow_run?.head_branch || "");
    const conclusion = String(event?.workflow_run?.conclusion || "");
    if (conclusion !== "success") return { proceed: false, reason: `ci-${conclusion || "unknown"}` };
    if (branch === "main" || activePrBranches.includes(branch)) return { proceed: true, reason: `ci-success-${branch}` };
    return { proceed: false, reason: `ci-unrelated-${branch || "unknown"}` };
  }
  return { proceed: false, reason: `unsupported-${eventName || "unknown"}` };
}

async function main() {
  if (!REPO || !EVENT_NAME) throw new Error("GITHUB_REPOSITORY and GITHUB_EVENT_NAME are required");
  const event = EVENT_PATH ? JSON.parse(await readFile(EVENT_PATH, "utf8")) : {};
  const issues = await ghJson(["issue", "list", "--repo", REPO, "--state", "open", "--label", "agent:active", "--limit", "100", "--json", "number"]);
  const prs = await ghJson(["pr", "list", "--repo", REPO, "--state", "open", "--limit", "100", "--json", "headRefName"]);
  const decision = decideQueueGuard({
    eventName: EVENT_NAME,
    event,
    activeIssueCount: (issues || []).length,
    activePrBranches: (prs || []).map(pr => String(pr.headRefName || "")).filter(branch => branch.startsWith("agent/"))
  });
  await setOutput("proceed", decision.proceed ? "true" : "false");
  await setOutput("reason", decision.reason);
  console.log(`[AOC-QUEUE-GUARD] proceed=${decision.proceed} reason=${decision.reason}`);
}

function selfTest() {
  assert.equal(decideQueueGuard({ eventName: "schedule", event: {}, activeIssueCount: 1, activePrBranches: [] }).proceed, false);
  assert.equal(decideQueueGuard({ eventName: "schedule", event: {}, activeIssueCount: 0, activePrBranches: [] }).proceed, true);
  assert.equal(decideQueueGuard({ eventName: "issue_comment", event: {}, activeIssueCount: 1, activePrBranches: [] }).proceed, true);
  assert.equal(decideQueueGuard({ eventName: "workflow_run", event: { workflow_run: { conclusion: "success", head_branch: "agent/lot-5j" } }, activeIssueCount: 1, activePrBranches: ["agent/lot-5j"] }).proceed, true);
  assert.equal(decideQueueGuard({ eventName: "workflow_run", event: { workflow_run: { conclusion: "success", head_branch: "chore/unrelated" } }, activeIssueCount: 1, activePrBranches: ["agent/lot-5j"] }).proceed, false);
  console.log("queue guard self-test passed");
}

if (process.argv.includes("--self-test")) selfTest();
else await main();
