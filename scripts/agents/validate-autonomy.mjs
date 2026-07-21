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

for (const file of requiredFiles) await fs.access(file);

const policy = JSON.parse(await fs.readFile("config/agents/policy.json", "utf8"));
const roles = JSON.parse(await fs.readFile("config/agents/roles.json", "utf8"));
const roadmap = JSON.parse(await fs.readFile("config/agents/roadmap.json", "utf8"));
const workflow = await fs.readFile(".github/workflows/autonomous-delivery.yml", "utf8");

if (!policy.enabledByDefault) throw new Error("Autonomous delivery must be enabled by default");
if (policy.maxFixRoundsPerPr < 1 || policy.maxFixRoundsPerPr > 5) throw new Error("Unsafe fix round policy");
if (!policy.merge?.requireExactApprovedSha) throw new Error("Exact approved SHA is mandatory");
if (!policy.merge?.requireDraftUntilApproval) throw new Error("Draft PR gate is mandatory");
if (!Array.isArray(policy.protectedPaths) || !policy.protectedPaths.includes("scripts/agents/")) throw new Error("Agent runtime is not protected");
if (!Array.isArray(policy.secretPatterns) || policy.secretPatterns.length < 4) throw new Error("Secret scanning policy is incomplete");
if (!Array.isArray(policy.humanGates) || policy.humanGates.length === 0) throw new Error("Human gates are missing");

const entries = Object.entries(roles.roles || {});
if (entries.length < 15) throw new Error(`Multi-agent team is incomplete: ${entries.length} roles`);
for (const [name, role] of entries) {
  if (!role.title || !role.mode || !role.model || !role.instructions) throw new Error(`Incomplete role: ${name}`);
  if (role.mode === "review" && role.canWrite) throw new Error(`Reviewer can write: ${name}`);
  if (role.canWrite && (!Array.isArray(role.allowedRoots) || role.allowedRoots.length === 0)) throw new Error(`Writer has no allowed roots: ${name}`);
}
if (roles.roles.cto_reviewer?.mode !== "review" || roles.roles.cto_reviewer?.canWrite) throw new Error("CTO reviewer must be read-only");
if (!roles.roles.ui_graphic_designer?.canGenerateImage) throw new Error("Graphic design capability is missing");

if (!Array.isArray(roadmap.lots) || roadmap.lots.length === 0) throw new Error("Autonomous roadmap is empty");
const ids = new Set();
const slugs = new Set();
for (const lot of roadmap.lots) {
  if (!lot.id || !lot.slug || !lot.title || !lot.objective || !Array.isArray(lot.acceptanceCriteria) || lot.acceptanceCriteria.length === 0) throw new Error(`Incomplete lot: ${JSON.stringify(lot)}`);
  if (ids.has(lot.id) || slugs.has(lot.slug)) throw new Error(`Duplicate lot identity: ${lot.id}/${lot.slug}`);
  ids.add(lot.id);
  slugs.add(lot.slug);
  for (const dependency of lot.dependsOn || []) {
    if (dependency !== "5I" && !roadmap.lots.some(candidate => candidate.id === dependency)) throw new Error(`Unknown dependency ${dependency} for ${lot.id}`);
  }
  for (const role of lot.requiredRoles || []) if (!roles.roles[role]) throw new Error(`Unknown role ${role} in lot ${lot.id}`);
  if (!(lot.requiredRoles || []).includes("cto_reviewer")) throw new Error(`Lot ${lot.id} has no CTO reviewer`);
  if (!(lot.requiredRoles || []).includes("qa_engineer")) throw new Error(`Lot ${lot.id} has no QA role`);
}

for (const required of ["models: read", "pull-requests: write", "schedule:", "workflow_run:", "issue_comment:", "scripts/agents/orchestrator.mjs"]) {
  if (!workflow.includes(required)) throw new Error(`Autonomous workflow is missing: ${required}`);
}

console.log(`Autonomy configuration valid: ${entries.length} roles, ${roadmap.lots.length} lots, ${requiredFiles.length} required files`);
