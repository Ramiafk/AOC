import { promises as fs } from "node:fs";

const requiredFiles = [
  ".github/workflows/autonomous-delivery.yml",
  ".github/workflows/ci.yml",
  "config/agents/policy.json",
  "config/agents/roles.json",
  "config/agents/roadmap.json",
  "scripts/agents/agent-runtime.mjs",
  "scripts/agents/orchestrator.mjs",
  "docs/AUTONOMOUS_DELIVERY.md",
  "docs/PRODUCT_VISION.md",
  "docs/TECHNICAL_VISION.md",
  "docs/CTO_REVIEW_PROTOCOL.md",
  "AGENTS.md"
];

const forbiddenLegacyFiles = [
  ".github/workflows/autonomous-developer.yml",
  ".github/workflows/autonomous-cto.yml",
  ".github/workflows/autonomous-next-lot.yml",
  ".github/workflows/autonomous-watchdog.yml",
  ".github/workflows/autonomous-policy.yml",
  ".github/ISSUE_TEMPLATE/autonomous-lot.md",
  "config/agents/backlog.json",
  "config/agents/cto-output.schema.json",
  "config/agents/cto-prompt.md",
  "config/agents/developer-prompt.md",
  "config/agents/protected-paths.json",
  "scripts/agents/check-protected-paths.mjs",
  "scripts/agents/github-models-agent.mjs",
  "scripts/agents/render-cto-comment.mjs",
  "docs/AUTONOMOUS_WORKFLOW.md"
];

for (const file of requiredFiles) await fs.access(file);
for (const file of forbiddenLegacyFiles) {
  try {
    await fs.access(file);
    throw new Error(`Legacy autonomous component is still active or present: ${file}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const policy = JSON.parse(await fs.readFile("config/agents/policy.json", "utf8"));
const roles = JSON.parse(await fs.readFile("config/agents/roles.json", "utf8"));
const roadmap = JSON.parse(await fs.readFile("config/agents/roadmap.json", "utf8"));
const workflow = await fs.readFile(".github/workflows/autonomous-delivery.yml", "utf8");
const ci = await fs.readFile(".github/workflows/ci.yml", "utf8");
const agents = await fs.readFile("AGENTS.md", "utf8");

if (!policy.enabledByDefault) throw new Error("Autonomous delivery must be enabled by default");
if (policy.maxFixRoundsPerPr < 1 || policy.maxFixRoundsPerPr > 5) throw new Error("Unsafe fix round policy");
if (!policy.merge?.requireExactApprovedSha) throw new Error("Exact approved SHA is mandatory");
if (!policy.merge?.requireDraftUntilApproval) throw new Error("Draft PR gate is mandatory");
if (!Array.isArray(policy.secretPatterns) || policy.secretPatterns.length < 6) throw new Error("Secret scanning policy is incomplete");
if (!Array.isArray(policy.humanGates) || policy.humanGates.length === 0) throw new Error("Human gates are missing");

for (const protectedPath of [
  ".github/workflows/",
  ".github/ISSUE_TEMPLATE/",
  "AGENTS.md",
  "package.json",
  "package-lock.json",
  "config/agents/",
  "scripts/agents/",
  "docs/PRODUCT_VISION.md",
  "docs/TECHNICAL_VISION.md"
]) {
  if (!policy.protectedPaths?.includes(protectedPath)) throw new Error(`Missing protected path: ${protectedPath}`);
}

for (const command of policy.requiredCommands || []) {
  if (!command.startsWith("env -u GH_TOKEN -u GITHUB_TOKEN -u GITHUB_MODELS_TOKEN -u OPENAI_API_KEY ")) {
    throw new Error(`Validation command does not strip credentials: ${command}`);
  }
}
if ((policy.allowedCommands || []).includes("npm ci")) throw new Error("Unsafe npm ci with lifecycle scripts is allowed");
if (!(policy.allowedCommands || []).some(command => command.endsWith("npm ci --ignore-scripts"))) throw new Error("Safe dependency installation command is missing");

const entries = Object.entries(roles.roles || {});
if (entries.length < 15) throw new Error(`Multi-agent team is incomplete: ${entries.length} roles`);
for (const [name, role] of entries) {
  if (!role.title || !role.mode || !role.model || !role.instructions) throw new Error(`Incomplete role: ${name}`);
  if (role.mode === "review" && role.canWrite) throw new Error(`Reviewer can write: ${name}`);
  if (role.canWrite && (!Array.isArray(role.allowedRoots) || role.allowedRoots.length === 0)) throw new Error(`Writer has no allowed roots: ${name}`);
  if ((role.allowedRoots || []).some(root => root === ".github/workflows/" || root.startsWith("config/agents") || root.startsWith("scripts/agents"))) {
    throw new Error(`Role can modify autonomous governance: ${name}`);
  }
}
if (roles.roles.cto_reviewer?.mode !== "review" || roles.roles.cto_reviewer?.canWrite) throw new Error("CTO reviewer must be read-only");
if (!roles.roles.ui_graphic_designer) throw new Error("Graphic design role is missing");

if (!Array.isArray(roadmap.lots) || roadmap.lots.length === 0) throw new Error("Autonomous roadmap is empty");
const ids = new Set();
const slugs = new Set();
const priorities = new Set();
for (const lot of roadmap.lots) {
  if (!lot.id || !lot.slug || !lot.title || !lot.objective || !Array.isArray(lot.acceptanceCriteria) || lot.acceptanceCriteria.length === 0) throw new Error(`Incomplete lot: ${JSON.stringify(lot)}`);
  if (ids.has(lot.id) || slugs.has(lot.slug) || priorities.has(lot.priority)) throw new Error(`Duplicate lot identity or priority: ${lot.id}/${lot.slug}/${lot.priority}`);
  ids.add(lot.id);
  slugs.add(lot.slug);
  priorities.add(lot.priority);
  for (const dependency of lot.dependsOn || []) {
    if (dependency !== "5I" && !roadmap.lots.some(candidate => candidate.id === dependency)) throw new Error(`Unknown dependency ${dependency} for ${lot.id}`);
    const parent = roadmap.lots.find(candidate => candidate.id === dependency);
    if (parent && parent.priority >= lot.priority) throw new Error(`Invalid dependency order: ${lot.id} depends on ${dependency}`);
  }
  for (const role of lot.requiredRoles || []) if (!roles.roles[role]) throw new Error(`Unknown role ${role} in lot ${lot.id}`);
  if (!(lot.requiredRoles || []).includes("cto_reviewer")) throw new Error(`Lot ${lot.id} has no CTO reviewer`);
  if (!(lot.requiredRoles || []).includes("qa_engineer")) throw new Error(`Lot ${lot.id} has no QA role`);
}

for (const required of ["models: read", "pull-requests: write", "schedule:", "workflow_run:", "issue_comment:", "scripts/agents/orchestrator.mjs", "npm ci --ignore-scripts", "AOC_GITHUB_ONLY"]) {
  if (!workflow.includes(required)) throw new Error(`Autonomous workflow is missing: ${required}`);
}
if (workflow.includes("OPENAI_API_KEY") || workflow.includes("api.openai.com")) throw new Error("GitHub-only workflow must not inject an external model credential");
for (const required of ["npm ci --ignore-scripts", "node --check scripts/agents/agent-runtime.mjs", "node --check scripts/agents/orchestrator.mjs", "node scripts/agents/validate-autonomy.mjs", "npx --no-install tsc --noEmit"]) {
  if (!ci.includes(required)) throw new Error(`CI is missing immutable governance validation: ${required}`);
}
if (!agents.includes("Le seul orchestrateur actif est **AOC Autonomous Delivery**")) throw new Error("AGENTS.md does not declare a single orchestrator");

console.log(`Autonomy configuration valid: ${entries.length} roles, ${roadmap.lots.length} lots, ${requiredFiles.length} required files, no legacy loop`);
