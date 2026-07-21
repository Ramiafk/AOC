#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const REPO = process.env.GITHUB_REPOSITORY;
const OWNER = REPO?.split("/")[0] || "";
const TASK_ROOT = resolve(ROOT, ".agent", "tasks");
const AGENT_LABELS = [
  "agent:backlog",
  "agent:ready",
  "agent:active",
  "agent:dev-working",
  "agent:cto-review",
  "agent:changes-required",
  "agent:approved",
  "agent:blocked",
  "agent:human-gate",
  "agent:paused",
  "agent:done"
];

function normalizedLogin(login) {
  return String(login || "").toLowerCase().replace(/^app\//, "").replace(/\[bot\]$/, "");
}

function isTrustedLogin(login, owner = OWNER) {
  const value = normalizedLogin(login);
  return value === String(owner || "").toLowerCase() || value === "github-actions";
}

function registryKey(issue) {
  const body = String(issue.body || "");
  if (body.includes("<!-- AOC-AUTONOMY-CONTROL -->")) return "control";
  const lot = /AOC-AUTONOMY-LOT:([A-Za-z0-9.-]+)/.exec(body)?.[1];
  return lot ? `lot:${lot}` : null;
}

function replacementBody(issue, key, canonicalNumber) {
  const original = String(issue.body || "");
  if (key === "control") {
    return original.replace(
      "<!-- AOC-AUTONOMY-CONTROL -->",
      `<!-- AOC-AUTONOMY-DUPLICATE-CONTROL:canonical-${canonicalNumber} -->`
    );
  }
  const id = key.slice("lot:".length);
  return original.replace(
    new RegExp(`AOC-AUTONOMY-LOT:${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    `AOC-AUTONOMY-DUPLICATE-LOT:${id}:canonical-${canonicalNumber}`
  );
}

export function planIssueReconciliation(issues, owner = OWNER) {
  const groups = new Map();
  for (const issue of issues) {
    if (!isTrustedLogin(issue.author?.login, owner)) continue;
    const key = registryKey(issue);
    if (!key) continue;
    const group = groups.get(key) || [];
    group.push(issue);
    groups.set(key, group);
  }

  const actions = [];
  for (const [key, group] of groups) {
    const sorted = [...group].sort((left, right) => Number(left.number) - Number(right.number));
    const canonical = sorted[0];
    for (const duplicate of sorted.slice(1)) {
      actions.push({
        key,
        canonicalNumber: canonical.number,
        duplicateNumber: duplicate.number,
        replacementBody: replacementBody(duplicate, key, canonical.number),
        close: String(duplicate.state || "").toUpperCase() === "OPEN"
      });
    }
  }
  return actions;
}

function run(command, args, { allowFailure = false } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { cwd: ROOT, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", rejectPromise);
    child.on("close", code => {
      const result = { code, stdout, stderr };
      if (code !== 0 && !allowFailure) rejectPromise(new Error(`${command} ${args.join(" ")} failed (${code})\n${stderr || stdout}`));
      else resolvePromise(result);
    });
  });
}

async function gh(args, options) {
  return (await run("gh", args, options)).stdout.trim();
}

async function listIssues() {
  const raw = await gh([
    "issue", "list", "--repo", REPO, "--state", "all", "--limit", "500",
    "--json", "number,title,body,state,labels,author,url"
  ]);
  return raw ? JSON.parse(raw) : [];
}

async function patchBody(issueNumber, body) {
  const path = resolve(TASK_ROOT, `reconcile-issue-${issueNumber}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ body })}\n`, "utf8");
  await gh(["api", "--method", "PATCH", `repos/${REPO}/issues/${issueNumber}`, "--input", path]);
}

async function stripAgentLabels(issueNumber) {
  for (const label of AGENT_LABELS) {
    await gh(["issue", "edit", String(issueNumber), "--repo", REPO, "--remove-label", label], { allowFailure: true });
  }
  await gh(["issue", "edit", String(issueNumber), "--repo", REPO, "--add-label", "agent:duplicate"], { allowFailure: true });
}

async function applyAction(action) {
  await patchBody(action.duplicateNumber, action.replacementBody);
  await stripAgentLabels(action.duplicateNumber);
  if (action.close) {
    await gh([
      "issue", "comment", String(action.duplicateNumber), "--repo", REPO,
      "--body", `[AOC-RECONCILIATION] Doublon ferme. Source de verite : #${action.canonicalNumber}. Le marqueur machine a ete neutralise avant fermeture.`
    ], { allowFailure: true });
    await gh([
      "issue", "close", String(action.duplicateNumber), "--repo", REPO,
      "--reason", "not planned"
    ]);
  }
}

async function realRun() {
  if (!REPO) throw new Error("GITHUB_REPOSITORY is required");
  if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) throw new Error("GH_TOKEN is required");
  let policy = { reconcileDuplicateIssues: true };
  try {
    policy = { ...policy, ...JSON.parse(await readFile(resolve(ROOT, "config/agents/policy.json"), "utf8")) };
  } catch {}
  if (!policy.reconcileDuplicateIssues) {
    console.log("Autonomous issue reconciliation is disabled by policy");
    return;
  }

  await gh([
    "label", "create", "agent:duplicate", "--repo", REPO,
    "--color", "cfd3d7", "--description", "Issue de gouvernance dupliquee et neutralisee", "--force"
  ], { allowFailure: true });

  const issues = await listIssues();
  const actions = planIssueReconciliation(issues);
  for (const action of actions) await applyAction(action);
  console.log(`Autonomous issue reconciliation complete: ${actions.length} duplicate issue(s) neutralized`);
}

function selfTest() {
  const fixtures = [
    { number: 16, state: "OPEN", body: "<!-- AOC-AUTONOMY-LOT:5J -->", author: { login: "owner" } },
    { number: 22, state: "OPEN", body: "<!-- AOC-AUTONOMY-LOT:5J -->", author: { login: "github-actions[bot]" } },
    { number: 18, state: "OPEN", body: "<!-- AOC-AUTONOMY-CONTROL -->", author: { login: "github-actions[bot]" } },
    { number: 24, state: "CLOSED", body: "<!-- AOC-AUTONOMY-CONTROL -->", author: { login: "owner" } },
    { number: 99, state: "OPEN", body: "<!-- AOC-AUTONOMY-LOT:5J -->", author: { login: "untrusted" } }
  ];
  const actions = planIssueReconciliation(fixtures, "owner");
  if (actions.length !== 2) throw new Error(`Expected 2 reconciliation actions, got ${actions.length}`);
  const lotAction = actions.find(action => action.duplicateNumber === 22);
  if (!lotAction || lotAction.canonicalNumber !== 16 || lotAction.replacementBody.includes("AOC-AUTONOMY-LOT:5J")) {
    throw new Error("Lot duplicate reconciliation is incorrect");
  }
  const controlAction = actions.find(action => action.duplicateNumber === 24);
  if (!controlAction || controlAction.canonicalNumber !== 18 || controlAction.close) {
    throw new Error("Control duplicate reconciliation is incorrect");
  }
  console.log("Autonomous issue reconciliation self-test passed");
}

const direct = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (direct) {
  if (process.argv.includes("--self-test")) selfTest();
  else await realRun();
}
