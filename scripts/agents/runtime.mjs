#!/usr/bin/env node
import { readFile, writeFile, mkdir, readdir, stat, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve, relative, sep } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(process.env.GITHUB_WORKSPACE || process.cwd());
const role = process.argv[2] || process.env.AOC_AGENT_ROLE;
const mode = process.argv[3] || process.env.AOC_AGENT_MODE || "review";
const apiKey = process.env.AOC_AGENT_API_KEY || process.env.OPENAI_API_KEY;
const model = process.env.AOC_AGENT_MODEL;
const endpoint = process.env.AOC_AGENT_ENDPOINT || "https://api.openai.com/v1/responses";
const resultPath = process.env.AOC_AGENT_RESULT_PATH || resolve(root, ".agent-result.json");

if (!role) throw new Error("AOC_AGENT_ROLE or the first CLI argument is required");
if (!apiKey) throw new Error("AOC_AGENT_API_KEY or OPENAI_API_KEY is required");
if (!model) throw new Error("AOC_AGENT_MODEL is required");

const policy = JSON.parse(await readFile(resolve(root, ".agents/policy.json"), "utf8"));
const roles = JSON.parse(await readFile(resolve(root, ".agents/roles.json"), "utf8"));
const roleDefinition = roles.roles.find((value) => value.id === role);
if (!roleDefinition && role !== "developer") throw new Error(`Unknown agent role: ${role}`);

const writable = role === "developer" || Boolean(roleDefinition?.writesCode);
const governanceTask = process.env.AOC_GOVERNANCE_TASK === "true";
const maxCalls = Number(process.env.AOC_AGENT_MAX_TOOL_CALLS || policy.maxAgentToolCallsPerRole || 60);
const allowedCommands = new Set(policy.allowedCommands || []);
const protectedPaths = policy.protectedPaths || [];

function normalizeRepoPath(input) {
  if (typeof input !== "string" || input.length === 0) throw new Error("A repository path is required");
  const absolute = resolve(root, input);
  const rel = relative(root, absolute);
  if (rel === "" || rel.startsWith(`..${sep}`) || rel === ".." || rel.includes(`${sep}.git${sep}`) || rel === ".git") {
    throw new Error(`Path is outside the writable repository surface: ${input}`);
  }
  return { absolute, relative: rel.split(sep).join("/") };
}

function assertWritablePath(input) {
  if (!writable) throw new Error(`Role ${role} is read-only`);
  const normalized = normalizeRepoPath(input);
  const protectedMatch = protectedPaths.some((item) => normalized.relative === item || normalized.relative.startsWith(item));
  if (protectedMatch && !governanceTask) throw new Error(`Protected path requires an explicit governance task: ${normalized.relative}`);
  return normalized;
}

async function run(command, options = {}) {
  const { stdout = "", stderr = "" } = await execFileAsync("bash", ["-lc", command], {
    cwd: root,
    timeout: options.timeout || 120000,
    maxBuffer: options.maxBuffer || 8 * 1024 * 1024,
    env: process.env,
  });
  return { stdout: stdout.slice(0, 500000), stderr: stderr.slice(0, 200000) };
}

async function listFiles({ prefix = "", limit = 500 } = {}) {
  const safePrefix = prefix.replace(/^\/+/, "");
  const { stdout } = await run("git ls-files -z", { maxBuffer: 16 * 1024 * 1024 });
  const files = stdout.split("\0").filter(Boolean).filter((file) => file.startsWith(safePrefix)).slice(0, Math.min(limit, 2000));
  return { files, truncated: files.length >= limit };
}

async function readRepoFile({ path, startLine = 1, endLine = 400 } = {}) {
  const target = normalizeRepoPath(path);
  const info = await stat(target.absolute);
  if (!info.isFile()) throw new Error(`${target.relative} is not a file`);
  if (info.size > Number(policy.maxReadBytesPerFile || 200000)) throw new Error(`${target.relative} exceeds the configured read limit`);
  const lines = (await readFile(target.absolute, "utf8")).split(/\r?\n/);
  const start = Math.max(1, Number(startLine));
  const end = Math.min(lines.length, Math.max(start, Number(endLine)));
  return {
    path: target.relative,
    startLine: start,
    endLine: end,
    totalLines: lines.length,
    content: lines.slice(start - 1, end).map((line, index) => `${start + index}: ${line}`).join("\n"),
  };
}

async function searchCode({ query, paths = [], limit = 200 } = {}) {
  if (typeof query !== "string" || query.length < 2 || query.length > 200) throw new Error("Search query must contain 2-200 characters");
  const pathArgs = Array.isArray(paths) && paths.length > 0
    ? ` -- ${paths.map((item) => `'${normalizeRepoPath(item).relative.replaceAll("'", "'\\''")}'`).join(" ")}`
    : "";
  const escaped = query.replaceAll("'", "'\\''");
  try {
    const { stdout } = await run(`git grep -n -I -F '${escaped}'${pathArgs}`, { maxBuffer: 8 * 1024 * 1024 });
    return { matches: stdout.split(/\r?\n/).filter(Boolean).slice(0, Math.min(limit, 1000)) };
  } catch (error) {
    if (String(error?.code) === "1") return { matches: [] };
    throw error;
  }
}

async function gitDiff({ base = process.env.AOC_BASE_REF || "origin/main", path = "" } = {}) {
  const safePath = path ? ` -- '${normalizeRepoPath(path).relative.replaceAll("'", "'\\''")}'` : "";
  const { stdout } = await run(`git diff --find-renames --find-copies ${base}...HEAD${safePath}`, { maxBuffer: 24 * 1024 * 1024 });
  return { base, diff: stdout.slice(0, 1500000), truncated: stdout.length > 1500000 };
}

async function gitStatus() {
  const { stdout } = await run("git status --short");
  return { status: stdout };
}

async function runCheck({ command } = {}) {
  if (!allowedCommands.has(command)) throw new Error(`Command is not allow-listed: ${command}`);
  try {
    const result = await run(command, { timeout: 20 * 60 * 1000, maxBuffer: 24 * 1024 * 1024 });
    return { command, ok: true, ...result };
  } catch (error) {
    return {
      command,
      ok: false,
      exitCode: error?.code ?? null,
      stdout: String(error?.stdout || "").slice(0, 500000),
      stderr: String(error?.stderr || error?.message || "").slice(0, 200000),
    };
  }
}

async function writeRepoFile({ path, content } = {}) {
  if (typeof content !== "string") throw new Error("File content must be a string");
  const target = assertWritablePath(path);
  await mkdir(dirname(target.absolute), { recursive: true });
  await writeFile(target.absolute, content, "utf8");
  return { path: target.relative, bytes: Buffer.byteLength(content) };
}

async function applyPatch({ patch } = {}) {
  if (!writable) throw new Error(`Role ${role} is read-only`);
  if (typeof patch !== "string" || !patch.includes("diff --git")) throw new Error("A unified git patch is required");
  for (const match of patch.matchAll(/^\+\+\+ b\/(.+)$/gm)) assertWritablePath(match[1]);
  const directory = await mkdtemp(resolve(tmpdir(), "aoc-agent-patch-"));
  const file = resolve(directory, "change.patch");
  try {
    await writeFile(file, patch, "utf8");
    const escaped = file.replaceAll("'", "'\\''");
    const result = await run(`git apply --whitespace=fix '${escaped}'`, { timeout: 120000 });
    return { applied: true, ...result };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const tools = [
  {
    type: "function",
    name: "list_files",
    description: "List tracked repository files, optionally under a prefix.",
    parameters: { type: "object", properties: { prefix: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 2000 } }, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "read_file",
    description: "Read a line range from a tracked repository file.",
    parameters: { type: "object", properties: { path: { type: "string" }, startLine: { type: "integer", minimum: 1 }, endLine: { type: "integer", minimum: 1 } }, required: ["path"], additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "search_code",
    description: "Search tracked text files for an exact string.",
    parameters: { type: "object", properties: { query: { type: "string" }, paths: { type: "array", items: { type: "string" } }, limit: { type: "integer", minimum: 1, maximum: 1000 } }, required: ["query"], additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "git_diff",
    description: "Read the current branch diff against a base reference.",
    parameters: { type: "object", properties: { base: { type: "string" }, path: { type: "string" } }, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "git_status",
    description: "Return the working tree status.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "run_check",
    description: "Run one repository validation command from the strict allow-list.",
    parameters: { type: "object", properties: { command: { type: "string", enum: [...allowedCommands] } }, required: ["command"], additionalProperties: false },
    strict: true,
  },
];

if (writable) {
  tools.push(
    {
      type: "function",
      name: "write_file",
      description: "Create or replace a repository text file within policy.",
      parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"], additionalProperties: false },
      strict: true,
    },
    {
      type: "function",
      name: "apply_patch",
      description: "Apply a unified git patch within policy.",
      parameters: { type: "object", properties: { patch: { type: "string" } }, required: ["patch"], additionalProperties: false },
      strict: true,
    },
  );
}

const toolHandlers = {
  list_files: listFiles,
  read_file: readRepoFile,
  search_code: searchCode,
  git_diff: gitDiff,
  git_status: gitStatus,
  run_check: runCheck,
  write_file: writeRepoFile,
  apply_patch: applyPatch,
};

async function optionalFile(path) {
  try { return await readFile(resolve(root, path), "utf8"); } catch { return ""; }
}

async function githubContext() {
  const pr = process.env.AOC_PR_NUMBER;
  if (!pr) return { repository: process.env.GITHUB_REPOSITORY || "", issue: process.env.AOC_LOT_ISSUE || "", extra: process.env.AOC_AGENT_CONTEXT || "" };
  try {
    const { stdout } = await run(`gh pr view ${Number(pr)} --json number,title,body,baseRefName,headRefName,headRefOid,isDraft,mergeable,files,comments,reviews,statusCheckRollup`, { maxBuffer: 16 * 1024 * 1024 });
    return JSON.parse(stdout);
  } catch (error) {
    return { prNumber: pr, contextError: String(error?.message || error), extra: process.env.AOC_AGENT_CONTEXT || "" };
  }
}

const commonPrompt = await optionalFile(".agents/prompts/common.md");
const rolePrompt = role === "developer"
  ? await optionalFile(".agents/prompts/developer.md")
  : role === "cto"
    ? await optionalFile(".agents/prompts/cto.md")
    : role === "orchestrator"
      ? await optionalFile(".agents/prompts/orchestrator.md")
      : await optionalFile(".agents/prompts/specialist.md");
const agentsInstructions = await optionalFile("AGENTS.md");
const context = await githubContext();

const instructions = [
  commonPrompt,
  rolePrompt,
  `\nYour selected role is ${role}. Role definition:\n${JSON.stringify(roleDefinition || { id: role, mode }, null, 2)}`,
  `\nRepository AGENTS.md:\n${agentsInstructions.slice(0, 80000)}`,
].join("\n\n");

const initialInput = [
  `Mode: ${mode}`,
  `Repository: ${process.env.GITHUB_REPOSITORY || "unknown"}`,
  `Base reference: ${process.env.AOC_BASE_REF || "origin/main"}`,
  `GitHub context:\n${JSON.stringify(context, null, 2).slice(0, 300000)}`,
  `Additional task context:\n${process.env.AOC_AGENT_CONTEXT || "No additional context supplied."}`,
  "Use repository tools before reaching a conclusion. Finish with the required machine-readable result.",
].join("\n\n");

async function request(payload) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Agent API ${response.status}: ${text.slice(0, 4000)}`);
  return JSON.parse(text);
}

function textFromResponse(response) {
  if (typeof response.output_text === "string") return response.output_text;
  return (response.output || [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text" || item.type === "text")
    .map((item) => item.text || "")
    .join("\n");
}

let response = await request({ model, instructions, input: initialInput, tools, tool_choice: "auto" });
let callsUsed = 0;
while (true) {
  const calls = (response.output || []).filter((item) => item.type === "function_call");
  if (calls.length === 0) break;
  callsUsed += calls.length;
  if (callsUsed > maxCalls) throw new Error(`Agent exceeded the ${maxCalls} tool-call limit`);
  const outputs = [];
  for (const call of calls) {
    let output;
    try {
      const args = JSON.parse(call.arguments || "{}");
      const handler = toolHandlers[call.name];
      if (!handler) throw new Error(`Unknown tool: ${call.name}`);
      output = { ok: true, result: await handler(args) };
    } catch (error) {
      output = { ok: false, error: String(error?.stack || error?.message || error) };
    }
    outputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(output) });
  }
  response = await request({ model, previous_response_id: response.id, input: outputs, tools, tool_choice: "auto" });
}

const finalText = textFromResponse(response).trim();
if (!finalText) throw new Error("Agent returned no final text");
const match = finalText.match(/<!-- aoc-agent-result:start -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- aoc-agent-result:end -->/);
if (!match) throw new Error("Agent did not return the required machine-readable result markers");
const result = JSON.parse(match[1]);
result.role ||= role;
result.headSha ||= process.env.GITHUB_SHA || "";
result.toolCallsUsed = callsUsed;
result.generatedAt = new Date().toISOString();
await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
process.stdout.write(`${finalText}\n`);
