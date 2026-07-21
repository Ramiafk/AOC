#!/usr/bin/env node
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(process.env.GITHUB_WORKSPACE || process.cwd());
const repository = process.env.GITHUB_REPOSITORY;
const runId = process.env.AOC_FAILED_RUN_ID;
const branch = process.env.AOC_FAILED_HEAD_BRANCH;
const token = process.env.AOC_AUTONOMY_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
const marker = "aoc-agent-event-v1";

if (!repository || !runId || !branch || !token) throw new Error("Repository, failed run, branch and token are required");
if (!branch.startsWith("agent/")) throw new Error(`Refusing to repair a non-agent branch: ${branch}`);

const env = { ...process.env, GH_TOKEN: token, GITHUB_TOKEN: token };

async function exec(command, args, options = {}) {
  try {
    const { stdout = "", stderr = "" } = await execFileAsync(command, args, {
      cwd: root,
      env: options.env || env,
      timeout: options.timeout || 120000,
      maxBuffer: options.maxBuffer || 64 * 1024 * 1024,
    });
    return { ok: true, stdout, stderr };
  } catch (error) {
    if (options.allowFailure) return { ok: false, stdout: String(error?.stdout || ""), stderr: String(error?.stderr || error?.message || ""), code: error?.code };
    throw error;
  }
}

await exec("git", ["fetch", "origin", branch]);
await exec("git", ["checkout", "-B", branch, `origin/${branch}`]);
await exec("git", ["fetch", "origin", "main"]);
const headSha = (await exec("git", ["rev-parse", "HEAD"])).stdout.trim();
const prs = JSON.parse((await exec("gh", ["pr", "list", "--repo", repository, "--state", "open", "--head", branch, "--json", "number,headRefOid", "--limit", "5"])).stdout || "[]");
const pr = prs.find((item) => item.headRefOid === headSha) || prs[0];
if (!pr) throw new Error(`No open PR found for ${branch}`);

const logResult = await exec("gh", ["run", "view", String(runId), "--repo", repository, "--log-failed"], { allowFailure: true, timeout: 180000, maxBuffer: 96 * 1024 * 1024 });
const logs = (logResult.stdout || logResult.stderr || "No failed logs were returned").slice(-500000);

const directory = await mkdtemp(resolve(tmpdir(), "aoc-ci-fix-"));
const resultPath = resolve(directory, "result.json");
try {
  const runtime = await exec("node", ["scripts/agents/runtime.mjs", "developer", "ci-fix"], {
    timeout: 90 * 60 * 1000,
    maxBuffer: 64 * 1024 * 1024,
    env: {
      ...env,
      AOC_AGENT_RESULT_PATH: resultPath,
      AOC_AGENT_CONTEXT: [
        `Repair CI run ${runId} for PR #${pr.number} at head ${headSha}.`,
        "Use the failed logs below as evidence. Do not weaken tests or safeguards.",
        logs,
      ].join("\n\n"),
      AOC_PR_NUMBER: String(pr.number),
      AOC_BASE_REF: "origin/main",
      GITHUB_SHA: headSha,
    },
  });
  const result = JSON.parse(await readFile(resultPath, "utf8"));
  const changed = (await exec("git", ["status", "--short"])).stdout.trim();
  if (!changed) {
    await exec("gh", ["pr", "comment", String(pr.number), "--repo", repository, "--body", `<!-- ${marker} role=developer sha=${headSha} status=blocked -->\nL’agent CI n’a produit aucune correction vérifiable pour le run #${runId}.\n\n${result.summary || ""}`]);
    process.exitCode = 1;
  } else {
    const checks = [];
    for (const command of ["npm run typecheck", "npm test", "npm run check"]) {
      const check = await exec("bash", ["-lc", command], { allowFailure: true, timeout: 30 * 60 * 1000 });
      checks.push({ command, ok: check.ok, stdout: check.stdout.slice(-12000), stderr: check.stderr.slice(-12000) });
      if (!check.ok) break;
    }
    if (checks.some((item) => !item.ok)) {
      await exec("gh", ["pr", "comment", String(pr.number), "--repo", repository, "--body", `<!-- ${marker} role=developer sha=${headSha} status=blocked -->\nUne correction a été générée mais les validations locales restent rouges. Aucun commit n’a été poussé.\n\n\`\`\`json\n${JSON.stringify(checks, null, 2).slice(0, 30000)}\n\`\`\``]);
      await exec("git", ["reset", "--hard", "HEAD"]);
      await exec("git", ["clean", "-fd"]);
      process.exitCode = 1;
    } else {
      await exec("git", ["add", "-A"]);
      await exec("git", ["commit", "-m", `fix: repair CI run #${runId}`]);
      await exec("git", ["push", "origin", `HEAD:${branch}`], { timeout: 180000 });
      const newSha = (await exec("git", ["rev-parse", "HEAD"])).stdout.trim();
      await exec("gh", ["pr", "comment", String(pr.number), "--repo", repository, "--body", `<!-- ${marker} role=developer sha=${newSha} status=completed -->\n## Correction CI autonome\n\n- Run en échec : #${runId}\n- Ancien SHA : \`${headSha}\`\n- Nouveau SHA : \`${newSha}\`\n- Validations locales : typecheck, tests et architecture réussis.\n\n${result.summary || ""}`]);
    }
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
