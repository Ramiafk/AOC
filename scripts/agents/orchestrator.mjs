#!/usr/bin/env node
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(process.env.GITHUB_WORKSPACE || process.cwd());
const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.AOC_AUTONOMY_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
const enabled = process.env.AOC_AUTONOMY_ENABLED === "true";
const autoMerge = process.env.AOC_AUTOMERGE_ENABLED !== "false";
const autoCreateLots = process.env.AOC_AUTO_CREATE_LOTS !== "false";
const policy = JSON.parse(await readFile(resolve(root, ".agents/policy.json"), "utf8"));
const roles = JSON.parse(await readFile(resolve(root, ".agents/roles.json"), "utf8"));
const marker = policy.machineCommentMarker || "aoc-agent-event-v1";

if (!repository) throw new Error("GITHUB_REPOSITORY is required");
if (!token) throw new Error("A GitHub token is required");
if (!enabled) {
  console.log("AOC autonomy is disabled. Set repository variable AOC_AUTONOMY_ENABLED=true to activate it.");
  process.exit(0);
}

const env = { ...process.env, GH_TOKEN: token, GITHUB_TOKEN: token };

async function exec(command, args = [], options = {}) {
  try {
    const { stdout = "", stderr = "" } = await execFileAsync(command, args, {
      cwd: options.cwd || root,
      env: options.env || env,
      timeout: options.timeout || 120000,
      maxBuffer: options.maxBuffer || 32 * 1024 * 1024,
    });
    return { ok: true, stdout, stderr };
  } catch (error) {
    if (options.allowFailure) {
      return {
        ok: false,
        code: error?.code ?? null,
        stdout: String(error?.stdout || ""),
        stderr: String(error?.stderr || error?.message || ""),
      };
    }
    throw error;
  }
}

async function ghJson(args) {
  const result = await exec("gh", args);
  return JSON.parse(result.stdout || "null");
}

async function gh(args, options = {}) {
  return exec("gh", args, options);
}

async function ensureLabels() {
  const definitions = [
    ["agent:paused", "B60205", "Pause all autonomous activity"],
    ["agent:human-required", "D93F0B", "Autonomy stopped pending an explicit decision"],
    ["agent:dev-working", "1D76DB", "Developer agent is implementing or correcting"],
    ["agent:reviewing", "5319E7", "Specialist or CTO review is running"],
    ["agent:changes-required", "D93F0B", "Current head requires corrections"],
    ["agent:approved", "0E8A16", "Current head has CTO approval"],
    ["agent:failed", "B60205", "Autonomous execution failed"],
    ["lot:ready", "C2E0C6", "Ready to become the single active lot"],
    ["lot:active", "FBCA04", "The single active product lot"],
    ["lot:merged", "0E8A16", "Lot merged into main"],
    ["agent:generated", "D4C5F9", "Created by the AOC autonomous product planner"],
  ];
  for (const [name, color, description] of definitions) {
    await gh(["label", "create", name, "--repo", repository, "--color", color, "--description", description, "--force"], { allowFailure: true });
  }
}

async function configurationReady() {
  const ready = Boolean(process.env.AOC_AGENT_API_KEY || process.env.OPENAI_API_KEY) && Boolean(process.env.AOC_AGENT_MODEL);
  if (ready) return true;
  const title = "[AUTONOMY] Configuration du moteur d’agents requise";
  const existing = await ghJson(["issue", "list", "--repo", repository, "--state", "open", "--search", `\"${title}\" in:title`, "--json", "number,title", "--limit", "10"]);
  const body = [
    "Le système multi-agents est installé mais volontairement arrêté : GitHub Actions ne possède pas encore les identifiants du moteur d’IA.",
    "",
    "Configuration unique requise dans **Settings → Secrets and variables → Actions** :",
    "",
    "- secret `AOC_AGENT_API_KEY` (ou `OPENAI_API_KEY`) ;",
    "- variable `AOC_AGENT_MODEL` ;",
    "- variable `AOC_AUTONOMY_ENABLED=true` ;",
    "- secret recommandé `AOC_AUTONOMY_GITHUB_TOKEN` provenant d’une GitHub App dédiée avec droits Contents/PR/Issues/Actions. Sans ce jeton séparé, les pushes du bot peuvent ne pas redéclencher la CI ;",
    "- variable facultative `AOC_AUTOMERGE_ENABLED=true` ;",
    "- variable facultative `AOC_AUTO_CREATE_LOTS=true`.",
    "",
    "Aucune clé ne doit être placée dans un fichier, un commentaire ou une issue.",
  ].join("\n");
  if (existing.length === 0) {
    await gh(["issue", "create", "--repo", repository, "--title", title, "--body", body, "--label", "agent:human-required"]);
  }
  return false;
}

async function repositoryPaused() {
  const pausedIssues = await ghJson(["issue", "list", "--repo", repository, "--state", "open", "--label", "agent:paused", "--json", "number", "--limit", "1"]);
  return pausedIssues.length > 0;
}

async function listProductPrs() {
  const prs = await ghJson([
    "pr", "list", "--repo", repository, "--state", "open", "--limit", "100",
    "--json", "number,title,url,headRefName,headRefOid,baseRefName,isDraft,isCrossRepository,mergeable,mergeStateStatus,labels,updatedAt",
  ]);
  return prs.filter((pr) => pr.headRefName.startsWith("agent/"));
}

async function commentsFor(prNumber) {
  return ghJson(["api", `repos/${repository}/issues/${prNumber}/comments`, "--paginate"]);
}

function eventFromComment(comment) {
  const regex = new RegExp(`<!--\\s*${marker}\\s+role=([^\\s]+)\\s+sha=([^\\s]+)\\s+status=([^\\s]+)\\s*-->`);
  const match = String(comment.body || "").match(regex);
  if (!match) return null;
  return { role: match[1], sha: match[2], status: match[3], createdAt: comment.created_at, id: comment.id, body: comment.body };
}

function currentEvents(comments, sha) {
  return comments.map(eventFromComment).filter(Boolean).filter((event) => event.sha === sha);
}

async function changedFiles(prNumber) {
  const files = await ghJson(["pr", "view", String(prNumber), "--repo", repository, "--json", "files"]);
  return (files.files || []).map((file) => file.path);
}

async function checkState(prNumber) {
  const result = await gh(["pr", "checks", String(prNumber), "--repo", repository, "--json", "name,state,bucket,workflow,link"], { allowFailure: true });
  if (!result.ok) return { state: "pending", checks: [], error: result.stderr.slice(0, 2000) };
  const checks = JSON.parse(result.stdout || "[]");
  if (checks.length === 0) return { state: "pending", checks };
  const failing = checks.filter((check) => ["fail", "cancel"].includes(String(check.bucket || "").toLowerCase()) || ["FAILURE", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED"].includes(check.state));
  if (failing.length > 0) return { state: "failure", checks, failing };
  const pending = checks.filter((check) => ["pending", "skipping"].includes(String(check.bucket || "").toLowerCase()) || ["PENDING", "QUEUED", "IN_PROGRESS", "WAITING", "REQUESTED"].includes(check.state));
  if (pending.length > 0) return { state: "pending", checks, pending };
  return { state: "success", checks };
}

async function setLabels(prNumber, add = [], remove = []) {
  for (const label of remove) await gh(["pr", "edit", String(prNumber), "--repo", repository, "--remove-label", label], { allowFailure: true });
  for (const label of add) await gh(["pr", "edit", String(prNumber), "--repo", repository, "--add-label", label], { allowFailure: true });
}

async function postComment(prNumber, body) {
  await gh(["pr", "comment", String(prNumber), "--repo", repository, "--body", body]);
}

function roleNeeded(roleId, files) {
  const definition = roles.roles.find((item) => item.id === roleId);
  if (!definition) return false;
  if (!definition.pathTriggers || definition.pathTriggers.length === 0) return true;
  return definition.pathTriggers.some((trigger) => files.some((file) => file.includes(trigger) || file.endsWith(trigger)));
}

function reviewRoles(files) {
  const required = [...policy.requiredReviewRoles].filter((roleId) => roleId !== "cto");
  for (const roleId of Object.keys(policy.conditionalReviewRoles || {})) {
    if (roleNeeded(roleId, files)) required.push(roleId);
  }
  return [...new Set(required)];
}

async function checkoutPr(prNumber) {
  await gh(["pr", "checkout", String(prNumber), "--repo", repository, "--force"]);
  await exec("git", ["fetch", "origin", "main"], { timeout: 120000 });
}

async function executeAgent(role, mode, context, prNumber, sha) {
  const directory = await mkdtemp(resolve(tmpdir(), `aoc-${role}-`));
  const resultPath = resolve(directory, "result.json");
  try {
    const result = await exec("node", ["scripts/agents/runtime.mjs", role, mode], {
      timeout: 90 * 60 * 1000,
      maxBuffer: 48 * 1024 * 1024,
      env: {
        ...env,
        AOC_AGENT_ROLE: role,
        AOC_AGENT_MODE: mode,
        AOC_AGENT_RESULT_PATH: resultPath,
        AOC_AGENT_CONTEXT: context,
        AOC_PR_NUMBER: prNumber ? String(prNumber) : "",
        AOC_BASE_REF: "origin/main",
        GITHUB_SHA: sha || "",
      },
    });
    const parsed = JSON.parse(await readFile(resultPath, "utf8"));
    return { result: parsed, output: result.stdout };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function renderAgentComment(role, sha, result, output) {
  const status = result.status || "blocked";
  const blockers = Array.isArray(result.blockingFindings) ? result.blockingFindings : [];
  const recommendations = Array.isArray(result.recommendations) ? result.recommendations : [];
  const ideas = Array.isArray(result.strategicIdeas) ? result.strategicIdeas : [];
  const lines = [
    `<!-- ${marker} role=${role} sha=${sha} status=${status} -->`,
    `## Agent ${role}`,
    "",
    `**Commit examiné :** \`${sha}\``,
    `**Statut :** \`${status}\``,
    "",
    result.summary || "Aucun résumé fourni.",
  ];
  if (blockers.length) lines.push("", "### Blocages", ...blockers.map((item, index) => `${index + 1}. ${typeof item === "string" ? item : JSON.stringify(item)}`));
  if (recommendations.length) lines.push("", "### Recommandations non bloquantes", ...recommendations.map((item) => `- ${typeof item === "string" ? item : JSON.stringify(item)}`));
  if (ideas.length) lines.push("", "### Idées stratégiques", ...ideas.map((item) => `- ${typeof item === "string" ? item : JSON.stringify(item)}`));
  if (result.humanEscalation) lines.push("", "### Escalade humaine requise", String(result.humanEscalation));
  lines.push("", "<details><summary>Résultat machine</summary>", "", "```json", JSON.stringify(result, null, 2), "```", "", "</details>");
  if (process.env.AOC_INCLUDE_AGENT_TRANSCRIPT === "true") lines.push("", "<details><summary>Compte rendu complet</summary>", "", output.slice(0, 50000), "", "</details>");
  return lines.join("\n");
}

async function runReviews(pr, files, comments) {
  await checkoutPr(pr.number);
  await setLabels(pr.number, ["agent:reviewing"], ["agent:dev-working", "agent:changes-required", "agent:approved"]);
  const events = currentEvents(comments, pr.headRefOid);
  const specialistResults = [];
  for (const role of reviewRoles(files)) {
    if (events.some((event) => event.role === role)) continue;
    const context = `Review PR #${pr.number} at head ${pr.headRefOid}. Changed files: ${JSON.stringify(files)}. Perform the ${role} specialist review only.`;
    const execution = await executeAgent(role, "review", context, pr.number, pr.headRefOid);
    specialistResults.push(execution.result);
    await postComment(pr.number, renderAgentComment(role, pr.headRefOid, execution.result, execution.output));
  }
  const refreshed = await commentsFor(pr.number);
  const refreshedEvents = currentEvents(refreshed, pr.headRefOid);
  const required = reviewRoles(files);
  if (!required.every((role) => refreshedEvents.some((event) => event.role === role))) return;
  if (refreshedEvents.some((event) => event.role === "cto")) return;
  const context = [
    `Perform the final CTO review for PR #${pr.number} at exact head ${pr.headRefOid}.`,
    `Changed files: ${JSON.stringify(files)}.`,
    "Specialist review comments for this SHA:",
    ...refreshedEvents.filter((event) => event.role !== "cto").map((event) => event.body.slice(0, 40000)),
  ].join("\n\n");
  const cto = await executeAgent("cto", "review", context, pr.number, pr.headRefOid);
  await postComment(pr.number, renderAgentComment("cto", pr.headRefOid, cto.result, cto.output));
  if (cto.result.status === "approved") {
    await setLabels(pr.number, ["agent:approved"], ["agent:reviewing", "agent:changes-required", "agent:dev-working"]);
  } else {
    await setLabels(pr.number, ["agent:changes-required"], ["agent:reviewing", "agent:approved"]);
  }
}

async function validationCommands() {
  const commands = ["npm run typecheck", "npm test", "npm run check"];
  const results = [];
  for (const command of commands) {
    const execution = await exec("bash", ["-lc", command], { timeout: 30 * 60 * 1000, maxBuffer: 64 * 1024 * 1024, allowFailure: true });
    results.push({ command, ok: execution.ok, stdout: execution.stdout.slice(-20000), stderr: execution.stderr.slice(-20000) });
    if (!execution.ok) break;
  }
  return results;
}

async function runDeveloperFix(pr, comments) {
  const events = currentEvents(comments, pr.headRefOid);
  const cto = [...events].reverse().find((event) => event.role === "cto" && event.status === "changes_required");
  if (!cto) return;
  const completedFixes = events.filter((event) => event.role === "developer" && event.status === "completed").length;
  if (completedFixes >= Number(policy.maxAutomaticFixRoundsPerHead || 3)) {
    await setLabels(pr.number, ["agent:human-required", "agent:failed"], ["agent:dev-working"]);
    await postComment(pr.number, `<!-- ${marker} role=orchestrator sha=${pr.headRefOid} status=blocked -->\nAutomatisation arrêtée après ${completedFixes} cycles de correction sur le même commit. Une décision explicite est requise.`);
    return;
  }
  await checkoutPr(pr.number);
  await setLabels(pr.number, ["agent:dev-working"], ["agent:reviewing", "agent:approved"]);
  const context = [
    `Correct PR #${pr.number} on the same branch at head ${pr.headRefOid}.`,
    "Resolve every blocking CTO finding below. Do not start another lot.",
    cto.body,
  ].join("\n\n");
  const developer = await executeAgent("developer", "fix", context, pr.number, pr.headRefOid);
  const status = await exec("git", ["status", "--short"]);
  if (!status.stdout.trim()) {
    await postComment(pr.number, renderAgentComment("developer", pr.headRefOid, { ...developer.result, status: "blocked", summary: `${developer.result.summary || ""} No repository changes were produced.` }, developer.output));
    await setLabels(pr.number, ["agent:human-required"], ["agent:dev-working"]);
    return;
  }
  const validation = await validationCommands();
  if (validation.some((item) => !item.ok)) {
    const failure = { ...developer.result, status: "blocked", summary: "Automated corrections were produced, but repository validation failed.", tests: validation };
    await postComment(pr.number, renderAgentComment("developer", pr.headRefOid, failure, developer.output));
    await exec("git", ["reset", "--hard", "HEAD"]);
    await exec("git", ["clean", "-fd"]);
    await setLabels(pr.number, ["agent:failed"], ["agent:dev-working"]);
    return;
  }
  await exec("git", ["add", "-A"]);
  await exec("git", ["commit", "-m", `fix: address CTO review for PR #${pr.number}`]);
  await exec("git", ["push", "origin", `HEAD:${pr.headRefName}`], { timeout: 180000 });
  const newSha = (await exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  const finalResult = { ...developer.result, status: "completed", headSha: newSha, tests: validation };
  await postComment(pr.number, renderAgentComment("developer", newSha, finalResult, developer.output));
  await setLabels(pr.number, [], ["agent:dev-working", "agent:changes-required", "agent:failed"]);
}

async function mergeApproved(pr, comments) {
  const events = currentEvents(comments, pr.headRefOid);
  const approval = [...events].reverse().find((event) => event.role === "cto" && event.status === "approved");
  if (!approval) return false;
  const checks = await checkState(pr.number);
  if (checks.state !== "success") return false;
  if (!autoMerge) return false;
  await gh(["pr", "ready", String(pr.number), "--repo", repository], { allowFailure: true });
  const merge = await gh(["pr", "merge", String(pr.number), "--repo", repository, "--squash", "--delete-branch"], { allowFailure: true, timeout: 180000 });
  if (!merge.ok) {
    const automatic = await gh(["pr", "merge", String(pr.number), "--repo", repository, "--auto", "--squash", "--delete-branch"], { allowFailure: true, timeout: 180000 });
    if (!automatic.ok) {
      await setLabels(pr.number, ["agent:human-required"], []);
      await postComment(pr.number, `<!-- ${marker} role=release sha=${pr.headRefOid} status=blocked -->\nLe commit est approuvé et la CI est verte, mais GitHub a refusé la fusion automatique. Détails :\n\n\`\`\`\n${(merge.stderr + automatic.stderr).slice(0, 4000)}\n\`\`\``);
      return false;
    }
  }
  return true;
}

async function nextReadyIssue() {
  const issues = await ghJson(["issue", "list", "--repo", repository, "--state", "open", "--label", "lot:ready", "--json", "number,title,body,labels,createdAt", "--limit", "100"]);
  return issues.find((issue) => !issue.labels.some((label) => label.name === "lot:active")) || null;
}

function slug(value) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

async function startIssue(issue) {
  await gh(["issue", "edit", String(issue.number), "--repo", repository, "--add-label", "lot:active", "--remove-label", "lot:ready"]);
  await exec("git", ["fetch", "origin", "main"]);
  await exec("git", ["checkout", "-B", "main", "origin/main"]);
  const branch = `agent/issue-${issue.number}-${slug(issue.title)}`;
  await exec("git", ["checkout", "-b", branch]);
  const context = `Implement GitHub issue #${issue.number}.\n\nTitle: ${issue.title}\n\n${issue.body || ""}\n\nCreate only this lot. Update its documentation and tests.`;
  const developer = await executeAgent("developer", "implement", context, null, "");
  const status = await exec("git", ["status", "--short"]);
  if (!status.stdout.trim()) throw new Error(`Developer agent produced no changes for issue #${issue.number}`);
  const validation = await validationCommands();
  if (validation.some((item) => !item.ok)) throw new Error(`Initial implementation for issue #${issue.number} failed validation: ${JSON.stringify(validation).slice(0, 10000)}`);
  await exec("git", ["add", "-A"]);
  await exec("git", ["commit", "-m", `feat: ${issue.title}`]);
  await exec("git", ["push", "-u", "origin", branch], { timeout: 180000 });
  const sha = (await exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  const body = [
    `Closes #${issue.number}`,
    "",
    "## Livraison autonome",
    "",
    `- Lot : #${issue.number} — ${issue.title}`,
    `- Branche : \`${branch}\``,
    `- Commit initial : \`${sha}\``,
    "- PR maintenue en brouillon jusqu’à validation CTO du SHA courant.",
    "- Aucun autre lot ne sera activé avant fusion.",
    "",
    "## Résultat développeur",
    "",
    developer.result.summary || "Implémentation autonome produite.",
  ].join("\n");
  const created = await gh(["pr", "create", "--repo", repository, "--base", "main", "--head", branch, "--draft", "--title", issue.title, "--body", body]);
  const url = created.stdout.trim();
  const numberMatch = url.match(/\/(\d+)$/);
  if (numberMatch) await setLabels(Number(numberMatch[1]), ["lot:active"], []);
}

async function proposeLotWhenBacklogEmpty() {
  if (!autoCreateLots) return;
  const existing = await ghJson(["issue", "list", "--repo", repository, "--state", "open", "--label", "agent:generated", "--json", "number", "--limit", "1"]);
  if (existing.length > 0) return;
  await exec("git", ["fetch", "origin", "main"]);
  await exec("git", ["checkout", "-B", "main", "origin/main"]);
  const context = [
    "No ready lot exists. Propose exactly one bounded next product lot for AOC.",
    "Use PRODUCT_VISION, DELIVERY_LOTS, recent merged lots and outstanding declared limits.",
    "The first recommendation must be an object with keys title, objective, scope, outOfScope, acceptanceCriteria, risks and requiredReviewRoles.",
    "Do not implement it in this run.",
  ].join("\n");
  const product = await executeAgent("product", "plan", context, null, "");
  const proposal = Array.isArray(product.result.recommendations) ? product.result.recommendations[0] : null;
  if (!proposal || typeof proposal !== "object" || !proposal.title) {
    const title = "[AUTONOMY] Le planificateur produit n’a pas produit de lot exploitable";
    await gh(["issue", "create", "--repo", repository, "--title", title, "--body", `Résultat reçu :\n\n\`\`\`json\n${JSON.stringify(product.result, null, 2)}\n\`\`\``, "--label", "agent:human-required"]);
    return;
  }
  const body = [
    `## Objectif\n\n${proposal.objective || ""}`,
    `## Périmètre\n\n${Array.isArray(proposal.scope) ? proposal.scope.map((item) => `- ${item}`).join("\n") : proposal.scope || ""}`,
    `## Hors périmètre\n\n${Array.isArray(proposal.outOfScope) ? proposal.outOfScope.map((item) => `- ${item}`).join("\n") : proposal.outOfScope || ""}`,
    `## Critères d’acceptation\n\n${Array.isArray(proposal.acceptanceCriteria) ? proposal.acceptanceCriteria.map((item) => `- [ ] ${item}`).join("\n") : proposal.acceptanceCriteria || ""}`,
    `## Risques\n\n${Array.isArray(proposal.risks) ? proposal.risks.map((item) => `- ${item}`).join("\n") : proposal.risks || ""}`,
    "## Gouvernance\n\nLot généré automatiquement. Une seule PR active est autorisée.",
  ].join("\n\n");
  await gh(["issue", "create", "--repo", repository, "--title", proposal.title, "--body", body, "--label", "lot:ready", "--label", "agent:generated"]);
}

async function main() {
  await ensureLabels();
  if (await repositoryPaused()) return console.log("AOC autonomy is paused.");
  if (!(await configurationReady())) return console.log("Agent runtime configuration is incomplete.");
  const prs = await listProductPrs();
  if (prs.length > Number(policy.activePullRequestLimit || 1)) {
    for (const pr of prs) await setLabels(pr.number, ["agent:human-required"], []);
    throw new Error(`Conflicting active product PRs: ${prs.map((pr) => `#${pr.number}`).join(", ")}`);
  }
  if (prs.length === 0) {
    const issue = await nextReadyIssue();
    if (issue) return startIssue(issue);
    return proposeLotWhenBacklogEmpty();
  }
  const pr = prs[0];
  if (pr.isCrossRepository) {
    await setLabels(pr.number, ["agent:human-required"], []);
    return postComment(pr.number, `<!-- ${marker} role=orchestrator sha=${pr.headRefOid} status=blocked -->\nAutonomie refusée sur une PR provenant d’un fork.`);
  }
  const comments = await commentsFor(pr.number);
  const events = currentEvents(comments, pr.headRefOid);
  const labels = pr.labels.map((label) => label.name);
  if (labels.includes("agent:paused")) return;
  const checks = await checkState(pr.number);
  if (checks.state === "pending") return console.log(`PR #${pr.number}: CI pending`);
  if (checks.state === "failure") {
    if (!events.some((event) => event.role === "orchestrator" && event.status === "ci_failure")) {
      await postComment(pr.number, `<!-- ${marker} role=orchestrator sha=${pr.headRefOid} status=ci_failure -->\nLa CI du commit \`${pr.headRefOid}\` échoue. L’agent développeur traitera les journaux au prochain cycle.\n\n\`\`\`json\n${JSON.stringify(checks.failing || checks.checks, null, 2).slice(0, 12000)}\n\`\`\``);
    }
    return;
  }
  const ctoApproval = [...events].reverse().find((event) => event.role === "cto" && event.status === "approved");
  if (ctoApproval) return mergeApproved(pr, comments);
  const ctoChanges = [...events].reverse().find((event) => event.role === "cto" && event.status === "changes_required");
  if (ctoChanges) return runDeveloperFix(pr, comments);
  const files = await changedFiles(pr.number);
  return runReviews(pr, files, comments);
}

main().catch(async (error) => {
  console.error(error?.stack || error);
  try {
    const prs = await listProductPrs();
    if (prs[0]) {
      await setLabels(prs[0].number, ["agent:failed"], []);
      await postComment(prs[0].number, `<!-- ${marker} role=orchestrator sha=${prs[0].headRefOid} status=blocked -->\nL’orchestrateur s’est arrêté sur une erreur vérifiable :\n\n\`\`\`\n${String(error?.stack || error).slice(0, 8000)}\n\`\`\``);
    }
  } catch (reportingError) {
    console.error("Could not report orchestrator failure:", reportingError);
  }
  process.exitCode = 1;
});
