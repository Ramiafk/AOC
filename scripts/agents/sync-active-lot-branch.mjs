#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO = process.env.GITHUB_REPOSITORY;

async function run(command, args, allowFailure = false) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { env: process.env, maxBuffer: 8 * 1024 * 1024 });
    return { code: 0, stdout, stderr };
  } catch (error) {
    if (!allowFailure) throw error;
    return { code: error.code || 1, stdout: error.stdout || "", stderr: error.stderr || error.message || "" };
  }
}

async function ghJson(args) {
  const result = await run("gh", args);
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}

export function needsSync(mainIsAncestorCode) {
  return Number(mainIsAncestorCode) !== 0;
}

async function comment(number, body) {
  await run("gh", ["issue", "comment", String(number), "--repo", REPO, "--body", body]);
}

async function sync() {
  if (!REPO) throw new Error("GITHUB_REPOSITORY is required");
  const prs = await ghJson(["pr", "list", "--repo", REPO, "--state", "open", "--limit", "20", "--json", "number,headRefName,isCrossRepository"]);
  const active = (prs || []).filter(pr => !pr.isCrossRepository && String(pr.headRefName || "").startsWith("agent/"));
  if (active.length !== 1) return;
  const pr = active[0];

  await run("gh", ["auth", "setup-git"]);
  await run("git", ["fetch", "origin", "main", pr.headRefName, "--prune"]);
  const ancestry = await run("git", ["merge-base", "--is-ancestor", "origin/main", `origin/${pr.headRefName}`], true);
  if (!needsSync(ancestry.code)) return;

  await run("git", ["checkout", "-B", pr.headRefName, `origin/${pr.headRefName}`]);
  await run("git", ["config", "user.name", "AOC Autonomous Team"]);
  await run("git", ["config", "user.email", "aoc-autonomy@users.noreply.github.com"]);
  const merge = await run("git", ["merge", "--no-edit", "origin/main"], true);
  if (merge.code !== 0) {
    await run("git", ["merge", "--abort"], true);
    await comment(pr.number, `[AOC-BRANCH-SYNC] Synchronisation non destructive impossible : conflit avec main.\n\n${String(merge.stderr || merge.stdout).slice(0, 4000)}`);
    throw new Error(`Active lot branch ${pr.headRefName} conflicts with main`);
  }
  await run("git", ["push", "origin", pr.headRefName]);
  await comment(pr.number, `[AOC-BRANCH-SYNC] La branche a integre main par merge non destructif avant la reprise des agents.`);
}

function selfTest() {
  assert.equal(needsSync(0), false);
  assert.equal(needsSync(1), true);
  console.log("active lot branch sync self-test passed");
}

if (process.argv.includes("--self-test")) selfTest();
else await sync();
