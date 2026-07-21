#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const REPO = process.env.GITHUB_REPOSITORY || "";
const OWNER = REPO.split("/")[0] || "";
const TASK_ROOT = resolve(ROOT, ".agent", "tasks");
const RETRY_MARKER = "[AOC-AUTO-RETRY]";
const LOT_MARKER = /AOC-AUTONOMY-LOT:([A-Za-z0-9.-]+)/;
const TRANSIENT_PATTERNS = Object.freeze([
  /GitHub Models 429/i,
  /Too many requests/i,
  /rate[ -]?limit/i,
  /GitHub Models (502|503|504)/i,
  /Maximum agent turns reached/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /fetch failed/i
]);

function normalizeLogin(login) {
  return String(login || "").toLowerCase().replace(/^app\//, "").replace(/\[bot\]$/, "");
}

function trustedLogin(login, owner = OWNER) {
  const normalized = normalizeLogin(login);
  return normalized === String(owner || "").toLowerCase() || normalized === "github-actions";
}

export function transientFailure(body) {
  const text = String(body || "");
  return TRANSIENT_PATTERNS.some(pattern => pattern.test(text));
}

function labelNames(issue) {
  return new Set((issue?.labels || []).map(label => typeof label === "string" ? label : label?.name).filter(Boolean));
}

export function buildRecoveryPlan(issues, commentsByIssue, { owner = OWNER, maximumRetries = 3 } = {}) {
  const safeMaximum = Math.max(0, Number(maximumRetries) || 0);
  const plan = [];
  for (const issue of issues || []) {
    if (!trustedLogin(issue?.author?.login, owner)) continue;
    if (!LOT_MARKER.test(String(issue?.body || ""))) continue;
    const labels = labelNames(issue);
    if (!labels.has("agent:blocked") || labels.has("agent:human-gate")) continue;
    const comments = commentsByIssue instanceof Map ? (commentsByIssue.get(issue.number) || []) : [];
    const latest = comments.length ? comments[comments.length - 1] : null;
    if (!latest || !transientFailure(latest.body)) continue;
    const retries = comments.reduce((count, comment) => count + (String(comment?.body || "").includes(RETRY_MARKER) ? 1 : 0), 0);
    if (retries >= safeMaximum) continue;
    plan.push({
      issueNumber: Number(issue.number),
      failureCommentId: Number(latest.id),
      retryNumber: retries + 1,
      existingLabels: [...labels]
    });
  }
  return plan;
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

async function listBlockedIssues() {
  const output = await gh([
    "issue", "list", "--repo", REPO, "--state", "open", "--label", "agent:blocked", "--limit", "100",
    "--json", "number,body,labels,author,url"
  ]);
  return output ? JSON.parse(output) : [];
}

async function commentsFor(issueNumber) {
  const output = await gh(["api", `repos/${REPO}/issues/${issueNumber}/comments?per_page=100`]);
  return output ? JSON.parse(output) : [];
}

async function applyRecovery(action) {
  const removable = new Set(["agent:blocked", "agent:active", "agent:dev-working", "agent:changes-required", "agent:approved"]);
  const editArgs = ["issue", "edit", String(action.issueNumber), "--repo", REPO, "--add-label", "agent:ready"];
  for (const label of action.existingLabels) if (removable.has(label)) editArgs.push("--remove-label", label);
  await gh(editArgs);

  const commentPath = resolve(TASK_ROOT, `auto-retry-${action.issueNumber}-${Date.now()}.md`);
  await mkdir(dirname(commentPath), { recursive: true });
  await writeFile(
    commentPath,
    `${RETRY_MARKER}[attempt:${action.retryNumber}][source-comment:${action.failureCommentId}]\n\nÉchec transitoire de GitHub Models détecté. Le lot est automatiquement réarmé après le passage planifié de backoff. Aucun périmètre métier n’a été modifié.\n`,
    "utf8"
  );
  await gh(["issue", "comment", String(action.issueNumber), "--repo", REPO, "--body-file", commentPath]);
}

async function realRun() {
  if (!REPO) throw new Error("GITHUB_REPOSITORY is required");
  if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) throw new Error("GH_TOKEN is required");
  if (process.env.GITHUB_EVENT_NAME && process.env.GITHUB_EVENT_NAME !== "schedule") {
    console.log(`Transient model recovery skipped for event ${process.env.GITHUB_EVENT_NAME}`);
    return;
  }

  let maximumRetries = 3;
  try {
    const policy = JSON.parse(await readFile(resolve(ROOT, "config/agents/policy.json"), "utf8"));
    maximumRetries = Number(policy.transientModelAutoRetryLimit) || maximumRetries;
  } catch {}

  const issues = await listBlockedIssues();
  const commentsByIssue = new Map();
  for (const issue of issues) commentsByIssue.set(issue.number, await commentsFor(issue.number));
  const plan = buildRecoveryPlan(issues, commentsByIssue, { owner: OWNER, maximumRetries });
  for (const action of plan) await applyRecovery(action);
  console.log(`Transient model recovery complete: ${plan.length} lot(s) rearmed`);
}

function selfTest() {
  const eligibleIssue = {
    number: 16,
    body: "<!-- AOC-AUTONOMY-LOT:5J -->",
    author: { login: "owner" },
    labels: [{ name: "agent:blocked" }, { name: "agent:active" }]
  };
  const eligibleComments = new Map([[16, [{ id: 101, body: "Error: GitHub Models 429: Too many requests" }]]]);
  const eligible = buildRecoveryPlan([eligibleIssue], eligibleComments, { owner: "owner", maximumRetries: 3 });
  if (eligible.length !== 1 || eligible[0].issueNumber !== 16 || eligible[0].retryNumber !== 1) {
    throw new Error(`Eligible retry plan is invalid: ${JSON.stringify(eligible)}`);
  }

  const exhaustedComments = new Map([[16, [
    { id: 1, body: `${RETRY_MARKER}[attempt:1]` },
    { id: 2, body: `${RETRY_MARKER}[attempt:2]` },
    { id: 3, body: `${RETRY_MARKER}[attempt:3]` },
    { id: 4, body: "Maximum agent turns reached (20)" }
  ]]]);
  const exhausted = buildRecoveryPlan([eligibleIssue], exhaustedComments, { owner: "owner", maximumRetries: 3 });
  if (exhausted.length !== 0) throw new Error(`Exhausted retry should remain blocked: ${JSON.stringify(exhausted)}`);

  const gatedIssue = { ...eligibleIssue, labels: [{ name: "agent:blocked" }, { name: "agent:human-gate" }] };
  const gated = buildRecoveryPlan([gatedIssue], eligibleComments, { owner: "owner", maximumRetries: 3 });
  if (gated.length !== 0) throw new Error("Human gate must never be auto-rearmed");
  if (!transientFailure("Maximum agent turns reached (20)")) throw new Error("Maximum-turn failures must be transient");
  if (transientFailure("SQL migration constraint failed")) throw new Error("Deterministic domain failures must not be transient");
  console.log("Transient model recovery v2 self-test passed");
}

const direct = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (direct) {
  if (process.argv.includes("--self-test")) selfTest();
  else await realRun();
}
