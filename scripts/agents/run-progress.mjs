#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO = process.env.GITHUB_REPOSITORY;
const RUN_ID = process.env.GITHUB_RUN_ID;
const RUN_ATTEMPT = process.env.GITHUB_RUN_ATTEMPT || "1";
const PHASE = process.argv[2] || "unknown";
const RESULT = process.argv[3] || process.env.AOC_RUN_RESULT || "unknown";

export function checkpointMessage(phase, runId, attempt, result = "unknown") {
  if (phase === "start") return `[AOC-RUN][run:${runId}][attempt:${attempt}][phase:start] Orchestration demarree.`;
  if (phase === "finish") {
    const messages = {
      "reports-produced": "Orchestration terminee avec rapports agents produits.",
      "branch-advanced": "Orchestration terminee avec avancement de la branche.",
      "no-production": "Orchestration bloquee : aucun rapport agent et aucun avancement de branche.",
      failed: "Orchestration terminee en echec technique."
    };
    return `[AOC-RUN][run:${runId}][attempt:${attempt}][phase:finish][result:${result}] ${messages[result] || "Orchestration terminee avec resultat indetermine."}`;
  }
  return `[AOC-RUN][run:${runId}][attempt:${attempt}][phase:${phase}][result:${result}]`;
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
  await gh(["issue", "comment", String(pr.number), "--repo", REPO, "--body", checkpointMessage(PHASE, RUN_ID, RUN_ATTEMPT, RESULT)]);
}

function selfTest() {
  assert.match(checkpointMessage("start", "123", "2"), /phase:start/);
  assert.match(checkpointMessage("finish", "123", "2", "reports-produced"), /result:reports-produced/);
  assert.match(checkpointMessage("finish", "123", "2", "no-production"), /bloquee/);
  console.log("run progress self-test passed");
}

if (process.argv.includes("--self-test")) selfTest();
else await publish();
