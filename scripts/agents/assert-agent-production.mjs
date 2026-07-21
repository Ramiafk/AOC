#!/usr/bin/env node
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO = process.env.GITHUB_REPOSITORY;

export function classifyProduction(reportCount, headBefore, headAfter) {
  if (reportCount > 0) return "reports-produced";
  if (headBefore && headAfter && headBefore !== headAfter) return "branch-advanced";
  return "no-production";
}

async function ghJson(args) {
  const { stdout } = await execFileAsync("gh", args, { env: process.env, maxBuffer: 8 * 1024 * 1024 });
  return stdout.trim() ? JSON.parse(stdout) : null;
}

async function comment(number, body) {
  await execFileAsync("gh", ["issue", "comment", String(number), "--repo", REPO, "--body", body], { env: process.env, maxBuffer: 8 * 1024 * 1024 });
}

async function verify() {
  if (!REPO) throw new Error("GITHUB_REPOSITORY is required");
  const prs = await ghJson(["pr", "list", "--repo", REPO, "--state", "open", "--limit", "20", "--json", "number,headRefName,headRefOid"]);
  const pr = (prs || []).find(item => String(item.headRefName || "").startsWith("agent/"));
  if (!pr) return;

  let reportCount = 0;
  try {
    reportCount = (await readdir(".agent/reports")).filter(name => name.endsWith(".json")).length;
  } catch {}
  const before = process.env.AOC_HEAD_BEFORE || "";
  const result = classifyProduction(reportCount, before, pr.headRefOid || "");
  if (process.env.GITHUB_OUTPUT) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(process.env.GITHUB_OUTPUT, `result=${result}\nreports=${reportCount}\n`, "utf8");
  }
  if (result === "no-production") {
    await comment(pr.number, "[AOC-WATCHDOG][result:no-production] Aucun rapport agent et aucun avancement de branche n'ont ete produits pendant cette orchestration. Le run est considere bloque, pas reussi.");
    process.exitCode = 2;
  }
}

function selfTest() {
  assert.equal(classifyProduction(1, "a", "a"), "reports-produced");
  assert.equal(classifyProduction(0, "a", "b"), "branch-advanced");
  assert.equal(classifyProduction(0, "a", "a"), "no-production");
  console.log("agent production watchdog self-test passed");
}

if (process.argv.includes("--self-test")) selfTest();
else await verify();
