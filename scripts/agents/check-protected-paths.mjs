import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const args = Object.fromEntries(process.argv.slice(2).filter((value) => value.startsWith("--")).map((value) => {
  const [key, ...rest] = value.slice(2).split("=");
  return [key, rest.join("=")];
}));

const filesPath = args.files;
const branch = args.branch ?? "";
if (!filesPath) throw new Error("--files is required");
const policy = JSON.parse(await fs.readFile(path.resolve("config/agents/protected-paths.json"), "utf8"));
const files = (await fs.readFile(path.resolve(filesPath), "utf8")).split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
const governanceBranch = policy.governanceBranchPrefixes.some((prefix) => branch.startsWith(prefix));
const violations = governanceBranch ? [] : files.filter((file) => policy.exact.includes(file) || policy.prefixes.some((prefix) => file.startsWith(prefix)));
const result = { branch, governanceBranch, filesChecked: files.length, violations };
console.log(JSON.stringify(result, null, 2));
if (violations.length) process.exitCode = 2;
