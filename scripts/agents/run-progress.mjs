#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO = process.env.GITHUB_REPOSITORY;
const RUN_ID = process.env.GITHUB_RUN_ID;
const RUN_ATTEMPT = process.env.GITHUB_RUN_ATTEMPT || "1";
const PHASE = process.argv[2] || "unknown";

export function checkpointMessage(phase, runId, attempt) {
  if (phase === "start") return `[AOC-RUN][run:${runId}][attempt:${attempt}][phase:start] Orchestration demarree.`;
  if (phase === "finish") return `[AOC-RUN][run:${runId}][attempt:${attempt}][phase:finish] Orchestration terminee. Verifier la PR active et les rapports publies.`;
  return `[AOC-RUN][run:${runId}][attempt:${attempt}][phase:${phase}]`;
}

async function ghJson(args) {
  const { stdout } = await execFileAsync("gh", args, { env: process.env, maxBuffer: 8 * 1024 * 1024 });
  return stdout.trim() ? JSON.parse(stdout) : null;
}

async function gh(args) {
  await execFileAsync("gh", args, { env: process.env, maxBuffer: 8 * 1024 * 1024 });
}

async function publish() {
  if (!REPO || !RUN_ID) return;
  const prs = await ghJson(["pr", "list", "--repo", REPO, "--state", "open", "--limit", "20", "--json", "number,headRefName"]);
  const pr = (prs || []).find(item => String(item.headRefName || "").startsWith("agent/"));
  if (!pr) return;
  await gh(["issue", "comment", String(pr.number), "--repo", REPO, "--body", checkpointMessage(PHASE, RUN_ID, RUN_ATTEMPT)]);
}

function selfTest() {
  assert.match(checkpointMessage("start", "123", "2"), /phase:start/);
  assert.match(checkpointMessage("finish", "123", "2"), /phase:finish/);
  console.log("run progress self-test passed");
}

if (process.argv.includes("--self-test")) selfTest();
else await publish();
