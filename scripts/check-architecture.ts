import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const forbidden = [/bel[ _-]?auto/i, /belauto/i];
const roots = ["packages", "infrastructure"];
const violations: string[] = [];

async function scan(path: string): Promise<void> {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const target = join(path, entry.name);
    if (entry.isDirectory()) await scan(target);
    else if (/\.(ts|sql|json)$/.test(entry.name)) {
      const content = await readFile(target, "utf8");
      if (forbidden.some(pattern => pattern.test(content))) violations.push(target);
    }
  }
}

for (const root of roots) await scan(root);
if (violations.length) throw new Error(`Pilot branding leaked into Core: ${violations.join(", ")}`);
console.log("Architecture checks passed");
