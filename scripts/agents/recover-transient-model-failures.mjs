#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const REPO = process.env.GITHUB_REPOSITORY;
const OWNER = REPO?.split("/")[0] || "";
const TASK_ROOT = resolve(ROOT, ".agent", "tasks");
const RETRY_MARKER = "[AOC-AUTO-RETRY]";
const LOT_MARKER = /AOC-AUTONOMY-LOT:([A-Za-z0-9.-]+)/;
const TRANSIENT_PATTERNS = [
  /GitHub Models 429/i,
  /Too many requests/i,
  /rate[ -]?limit/i,
  /GitHub Models (502|503|504)/i,
  /Maximum agent turns reached/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /fetch failed/i
];

function normalizedLogin(login) {
  return String(login || "").toLowerCase().replace(/^app\//, "").replace(/\[bot\]$/, "");
}

function isTrustedLogin(login, owner = OWNER) {
  const value = normalizedLogin(login);
  return value === String(owner || "").toLowerCase() || value === "github-actions";
}

export function isTransientModelFailure(body) {
  const value = String(body || "");
  return TRANSIENT_PATTERNS.some(pattern => pattern.test(value));
}

export function planTransientRecoveries(issues, commentsByIssue, options = {}) {
  const owner = options.owner ?? OWNER;
  const maximumRetries = Math.max(0, Number(options.maximumRetries ?? 3));
  const actions = [];
  for (const issue of issues || []) {
    if (!isTrustedLogin(issue.author?.login, owner)) continue;
    if (!LOT_MARKER.test(String(issue.body || ""))) continue;
    const labels = new Set((issue.labels || []).map(label => typeof label === "string" ? label : label.name));
    if (!labels.has("agent:blocked") || labels.has("agent:human-gate")) continue;
    const comments = commentsByIssue.get(issue.number) || [];
    const latest = comments.at(-1);
    if (!latest || !isTransientModelFailure(latest.body)) continue;
    const retryCount = comments.filter(comment => String(comment.body || "").includes(RETRY_MARKER)).length;
    if (retryCount >= maximumRetries) continue;
    actions.push({
      issueNumber: issue.number,
      retryNumber: retryCount + 1,
      failureCommentId: latest.id,
      existingLabels: [...labels]
    });
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

async function listBlockedIssues() {
  const raw = await gh([
    "issue", "list", "--repo", REPO, "--state", "open", "--label", "agent:blocked", "--limit", "100",
    "--json", "number,body,labels,author,url"
  ]);
  return raw ? JSON.parse(raw) : [];
}

async function issueComments(issueNumber) {
  const raw = await gh(["api", `repos/${REPO}/issues/${issueNumber}/comments?per_page=100`]);
  return raw ? JSON.parse(raw) : [];
}

async function rearm(action) {
  const removable = new Set(["agent:blocked", "agent:active", "agent:dev-working", "agent:changes-required", "agent:approved"]);
  const args = ["issue", "edit", String(action.issueNumber), "--repo", REPO, "--add-label", "agent:ready"];
  for (const label of action.existingLabels) if (removable.has(label)) args.push("--remove-label", label);
  await gh(args);

  const path = resolve(TASK_ROOT, `auto-retry-${action.issueNumber}-${Date.now()}.md`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${RETRY_MARKER}[attempt:${action.retryNumber}][source-comment:${action.failureCommentId}]\n\nÉchec transitoire de GitHub Models détecté. Le lot est automatiquement réarmé après le passage planifié de backoff. Aucun périmètre métier n’a été modifié.\n`, "utf8");
  await gh(["issue", "comment", String(action.issueNumber), "--repo", REPO, "--body-file", path]);
}

async function realRun() {
  if (!REPO) throw new Error("GITHUB_REPOSITORY is required");
  if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) throw new Error("GH_TOKEN is required");
  if (process.env.GITHUB_EVENT_NAME && process.env.GITHUB_EVENT_NAME !== "schedule") {
    console.log(`Transient model recovery skipped for event ${process.env.GITHUB_EVENT_NAME}`);
    return;
  }
  let policy = { transientModelAutoRetryLimit: 3 };
  try {
    policy = { ...policy, ...JSON.parse(await readFile(resolve(ROOT, "config/agents/policy.json"), "utf8")) };
  } catch {}

  const issues = await listBlockedIssues();
  const commentsByIssue = new Map();
  for (const issue of issues) commentsByIssue.set(issue.number, await issueComments(issue.number));
  const actions = planTransientRecoveries(issues, commentsByIssue, {
    owner: OWNER,
    maximumRetries: policy.transientModelAutoRetryLimit
  });
  for (const action of actions) await rearm(action);
  console.log(`Transient model recovery complete: ${actions.length} lot(s) rearmed`);
}

function selfTest() {
  const issues = [
    { number: 16, body: "<!-- AOC-AUTONOMY-LOT:5J -->", author: { login: "owner" }, labels: [{ name: "agent:blocked" }, { name: "agent:active" }] },
    { number: 17, body: "<!-- AOC-AUTONOMY-LOT:5K -->", author: { login: "github-actions[bot]" }, labels: [{ name: "agent:blocked" }] },
    { number: 18, body: "<!-- AOC-AUTONOMY-LOT:5L -->", author: { login: "owner" }, labels: [{ name: "agent:blocked" }, { name: "agent:human-gate" }] },
    { number: 19, body: "ordinary issue", author: { login: "owner" }, labels: [{ name: "agent:blocked" }] }
  ];
  const comments = new Map([
    [16, [{ id: 1, body: "Error: GitHub Models 429: Too many requests" }]],
    [17, [
      { id: 2, body: `${RETRY_MARKER}[attempt:1]` },
      { id: 3, body: `${RETRY_MARKER}[attempt:2]` },
      { id: 4, body: `${RETRY_MARKER}[attempt:3]` },
      { id: 5, body: "Maximum agent turns reached (14)" }
    ]],
    [18, [{ id: 6, body: "GitHub Models 503" }]],
    [19, [{ id: 7, body: "GitHub Models 429" }]]
  ]);
  const actions = planTransientRecoveries(issues, comments, { owner: "owner", maximumRetries: 3 });
  if (actions.length !== 1 || actions[0].issueNumber !== 16 || actions[0].retryNumber !== 1) {
    throw new Error(`Unexpected recovery plan: ${JSON.stringify(actions)}`);
  }
  if (!isTransientModelFailure("Maximum agent turns reached (14)")) throw new Error("Maximum-turn failure must be recoverable");
  if (isTransientModelFailure("SQL migration constraint failed")) throw new Error("Deterministic domain failure must not be retried");
  console.log("Transient model recovery self-test passed");
}

const direct = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (direct) {
  if (process.argv.includes("--self-test")) selfTest();
  else await realRun();
}
