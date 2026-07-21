#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO = process.env.GITHUB_REPOSITORY;
const EVENT_PATH = process.env.GITHUB_EVENT_PATH;
const EVENT_NAME = process.env.GITHUB_EVENT_NAME;
const OWNER = REPO?.split("/")[0]?.toLowerCase();
const CONTROL_MARKER = "AOC-AUTONOMY-CONTROL";

function normalizedLogin(login) {
  return String(login || "").toLowerCase().replace(/^app\//, "").replace(/\[bot\]$/, "");
}

export function parseAgentCommand(body) {
  const match = /^\/agent\s+(pause|resume|retry|status|abort)(?:\s+([a-z0-9.-]+))?\s*$/i.exec(String(body || "").trim());
  return match ? { action: match[1].toLowerCase(), lotId: match[2]?.toUpperCase() || null } : null;
}

export function isTrustedCommand(event, owner) {
  const association = String(event.comment?.author_association || "").toUpperCase();
  const login = normalizedLogin(event.comment?.user?.login);
  return ["OWNER", "MEMBER", "COLLABORATOR"].includes(association) || login === owner || login === "github-actions";
}

async function ghJson(args) {
  const { stdout } = await execFileAsync("gh", args, { env: process.env, maxBuffer: 8 * 1024 * 1024 });
  return stdout.trim() ? JSON.parse(stdout) : null;
}

async function gh(args) {
  await execFileAsync("gh", args, { env: process.env, maxBuffer: 8 * 1024 * 1024 });
}

async function findControlIssue() {
  const issues = await ghJson(["issue", "list", "--repo", REPO, "--state", "open", "--limit", "100", "--json", "number,body,labels"]);
  return (issues || []).find(issue => String(issue.body || "").includes(CONTROL_MARKER)) || null;
}

async function editLabels(number, add = [], remove = []) {
  const args = ["issue", "edit", String(number), "--repo", REPO];
  for (const label of add) args.push("--add-label", label);
  for (const label of remove) args.push("--remove-label", label);
  if (add.length || remove.length) await gh(args);
}

async function dispatchFollowUp(reason) {
  await gh(["workflow", "run", "autonomous-delivery.yml", "--repo", REPO, "--ref", "main", "-f", `reason=${reason}`]);
}

async function comment(number, body) {
  await gh(["issue", "comment", String(number), "--repo", REPO, "--body", body]);
}

async function route() {
  if (EVENT_NAME !== "issue_comment" || !EVENT_PATH || !REPO) return;
  const event = JSON.parse(await readFile(EVENT_PATH, "utf8"));
  const command = parseAgentCommand(event.comment?.body);
  if (!command || !isTrustedCommand(event, OWNER)) return;

  const control = await findControlIssue();
  if (!control) throw new Error("Canonical autonomy control issue not found");
  const sourceIssue = Number(event.issue?.number);
  const sourceIsControl = String(event.issue?.body || "").includes(CONTROL_MARKER);

  if (command.action === "resume") {
    await editLabels(control.number, [], ["agent:paused", "agent:blocked"]);
    if (!sourceIsControl) await comment(sourceIssue, `[AOC-COMMAND-ROUTER] Commande recue pour le lot ${command.lotId || "actif"}. La console #${control.number} a ete reactivee.`);
    await dispatchFollowUp(`resume-${command.lotId || "active"}`);
    return;
  }

  if (command.action === "retry") {
    await editLabels(control.number, [], ["agent:blocked"]);
    if (!sourceIsControl) await comment(sourceIssue, `[AOC-COMMAND-ROUTER] Nouvelle tentative demandee pour le lot ${command.lotId || "actif"}.`);
    await dispatchFollowUp(`retry-${command.lotId || "active"}`);
  }
}

function selfTest() {
  assert.deepEqual(parseAgentCommand("/agent resume 5j"), { action: "resume", lotId: "5J" });
  assert.deepEqual(parseAgentCommand(" /agent retry "), { action: "retry", lotId: null });
  assert.equal(parseAgentCommand("/agent resume 5J extra"), null);
  assert.equal(isTrustedCommand({ comment: { author_association: "OWNER", user: { login: "x" } } }, "owner"), true);
  assert.equal(isTrustedCommand({ comment: { author_association: "NONE", user: { login: "intruder" } } }, "owner"), false);
  console.log("command router self-test passed");
}

if (process.argv.includes("--self-test")) selfTest();
else await route();
