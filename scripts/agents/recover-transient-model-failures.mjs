#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO = process.env.GITHUB_REPOSITORY;
const MAX_RETRIES = 3;
const RETRY_MARKER = "AOC-TRANSIENT-RETRY";
const TRANSIENT_PATTERNS = [
  /GitHub Models (429|502|503|504)/i,
  /Too many requests/i,
  /timed out/i,
  /Maximum agent turns reached/i,
  /Maximum tool loop reached/i,
  /ECONNRESET|ETIMEDOUT|socket hang up/i
];

if (!REPO && !process.argv.includes("--self-test")) {
  throw new Error("GITHUB_REPOSITORY is required");
}

async function ghJson(args) {
  const { stdout } = await execFileAsync("gh", args, {
    env: process.env,
    maxBuffer: 8 * 1024 * 1024
  });
  return stdout.trim() ? JSON.parse(stdout) : null;
}

function labelsOf(issue) {
  return new Set((issue.labels || []).map(label => typeof label === "string" ? label : label.name));
}

function isTransientFailure(body) {
  const text = String(body || "");
  return TRANSIENT_PATTERNS.some(pattern => pattern.test(text));
}

function retryCount(comments) {
  return comments.filter(comment => String(comment.body || "").includes(`<!-- ${RETRY_MARKER}:`)).length;
}

function latestBlockingComment(comments) {
  return [...comments]
    .filter(comment => /Lot suspendu|Echec technique|Statut : blocked/i.test(String(comment.body || "")))
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0] || null;
}

export function buildRecoveryPlan(issue, comments) {
  const labels = labelsOf(issue);
  if (!labels.has("agent:active") || !labels.has("agent:blocked")) return null;
  if (labels.has("agent:human-gate") || labels.has("agent:paused")) return null;
  const blocker = latestBlockingComment(comments);
  if (!blocker || !isTransientFailure(blocker.body)) return null;
  const attempts = retryCount(comments);
  if (attempts >= MAX_RETRIES) return null;
  return {
    issueNumber: issue.number,
    attempt: attempts + 1,
    blockerId: blocker.id,
    removableLabels: ["agent:active", "agent:blocked", "agent:dev-working"].filter(label => labels.has(label))
  };
}

async function editIssueLabels(plan) {
  const args = [
    "issue", "edit", String(plan.issueNumber), "--repo", REPO,
    "--add-label", "agent:ready"
  ];
  for (const label of plan.removableLabels) args.push("--remove-label", label);
  await execFileAsync("gh", args, { env: process.env, maxBuffer: 1024 * 1024 });
}

async function commentRecovery(plan) {
  const body = [
    `<!-- ${RETRY_MARKER}:${plan.attempt}:blocker-${plan.blockerId} -->`,
    "[AOC-ORCHESTRATOR] Reprise automatique d'un incident transitoire GitHub Models.",
    "",
    `Tentative bornée : ${plan.attempt}/${MAX_RETRIES}.`,
    "Le lot est replacé en `agent:ready`. Les blocages métier, sécurité et human gates ne sont jamais réarmés automatiquement."
  ].join("\n");
  await execFileAsync("gh", ["issue", "comment", String(plan.issueNumber), "--repo", REPO, "--body", body], {
    env: process.env,
    maxBuffer: 1024 * 1024
  });
}

async function recover() {
  const issues = await ghJson([
    "issue", "list", "--repo", REPO, "--state", "open", "--limit", "100",
    "--label", "agent:active", "--label", "agent:blocked",
    "--json", "number,labels,body,state"
  ]);
  for (const issue of issues || []) {
    const comments = await ghJson(["api", `repos/${REPO}/issues/${issue.number}/comments`, "--paginate"]);
    const plan = buildRecoveryPlan(issue, comments || []);
    if (!plan) continue;
    await editIssueLabels(plan);
    await commentRecovery(plan);
    console.log(`Recovered transient failure for issue #${plan.issueNumber}, attempt ${plan.attempt}/${MAX_RETRIES}`);
  }
}

function selfTest() {
  const issue = { number: 16, labels: [{ name: "agent:active" }, { name: "agent:blocked" }] };
  const comments = [{ id: 10, created_at: "2026-07-21T19:00:00Z", body: "Lot suspendu. GitHub Models 429: Too many requests" }];
  const plan = buildRecoveryPlan(issue, comments);
  if (!plan || plan.attempt !== 1 || plan.blockerId !== 10) throw new Error("Transient recovery plan was not created");
  if (plan.removableLabels.join(",") !== "agent:active,agent:blocked") throw new Error("Only present labels may be removed");
  const humanGate = buildRecoveryPlan({ ...issue, labels: [...issue.labels, { name: "agent:human-gate" }] }, comments);
  if (humanGate) throw new Error("Human gate must never be retried");
  const exhausted = buildRecoveryPlan(issue, [
    ...comments,
    ...Array.from({ length: 3 }, (_, index) => ({ body: `<!-- ${RETRY_MARKER}:${index + 1} -->` }))
  ]);
  if (exhausted) throw new Error("Retry limit must be enforced");
  const deterministic = buildRecoveryPlan(issue, [{ id: 11, created_at: "2026-07-21T19:01:00Z", body: "Lot suspendu. Violation de contrainte métier" }]);
  if (deterministic) throw new Error("Deterministic failures must not be retried");
  console.log("Transient model recovery self-test passed");
}

if (process.argv.includes("--self-test")) selfTest();
else await recover();
