import { promises as fs } from "node:fs";

const requiredFiles = [
  ".github/workflows/autonomous-developer.yml",
  ".github/workflows/autonomous-cto.yml",
  ".github/workflows/autonomous-next-lot.yml",
  ".github/workflows/autonomous-watchdog.yml",
  ".github/workflows/autonomous-policy.yml",
  "config/agents/developer-prompt.md",
  "config/agents/cto-prompt.md",
  "config/agents/cto-output.schema.json",
  "config/agents/protected-paths.json",
  "config/agents/backlog.json",
  "docs/AUTONOMOUS_WORKFLOW.md"
];

for (const file of requiredFiles) await fs.access(file);
const backlog = JSON.parse(await fs.readFile("config/agents/backlog.json", "utf8"));
const schema = JSON.parse(await fs.readFile("config/agents/cto-output.schema.json", "utf8"));
const policy = JSON.parse(await fs.readFile("config/agents/protected-paths.json", "utf8"));
if (!Array.isArray(backlog.lots) || backlog.lots.length === 0) throw new Error("Autonomous backlog is empty");
const ids = new Set();
const branches = new Set();
for (const lot of backlog.lots) {
  if (!lot.id || !lot.title || !lot.branch || !lot.objective) throw new Error(`Incomplete lot: ${JSON.stringify(lot)}`);
  if (ids.has(lot.id)) throw new Error(`Duplicate lot id: ${lot.id}`);
  if (branches.has(lot.branch)) throw new Error(`Duplicate branch: ${lot.branch}`);
  if (!lot.branch.startsWith("agent/lot-")) throw new Error(`Invalid autonomous branch: ${lot.branch}`);
  ids.add(lot.id);
  branches.add(lot.branch);
}
if (!schema.properties?.decision) throw new Error("CTO schema has no decision field");
if (!policy.prefixes?.includes(".github/workflows/")) throw new Error("Workflow governance paths are not protected");
console.log(`Autonomy configuration valid: ${backlog.lots.length} lots, ${requiredFiles.length} required files`);
