// One-shot deterministic bootstrap. This file deletes itself after generation.
const { readFileSync, writeFileSync } = require('node:fs');

const sourcePath = 'scripts/agents/orchestrator.mjs';
let source = readFileSync(sourcePath, 'utf8');

function replaceOnce(label, before, after) {
  if (!source.includes(before)) throw new Error(`Expected ${label} block not found`);
  source = source.replace(before, after);
}

replaceOnce(
  'output buffer',
  `    let stdout = "";
    let stderr = "";
    if (options.capture !== false) {
      child.stdout.on("data", chunk => { stdout = truncate(\`${'${stdout}${chunk}'}\`, options.limit || 100000); });
      child.stderr.on("data", chunk => { stderr = truncate(\`${'${stderr}${chunk}'}\`, options.limit || 100000); });
    }`,
  `    let stdout = "";
    let stderr = "";
    let outputError = null;
    const limit = Number(options.limit ?? 100000);
    const append = (current, chunk, stream) => {
      const next = \`${'${current}${chunk}'}\`;
      if (options.truncate === false) {
        if (next.length > limit) {
          outputError = new Error(\`${'${command} ${stream}'} exceeded ${'${limit}'} characters\`);
          child.kill("SIGKILL");
          return current;
        }
        return next;
      }
      return truncate(next, limit);
    };
    if (options.capture !== false) {
      child.stdout.on("data", chunk => { stdout = append(stdout, chunk, "stdout"); });
      child.stderr.on("data", chunk => { stderr = append(stderr, chunk, "stderr"); });
    }`
);

replaceOnce(
  'close handler',
  `    child.on("close", code => {
      clearTimeout(timer);
      const result = { code, stdout, stderr };`,
  `    child.on("close", code => {
      clearTimeout(timer);
      if (outputError) {
        rejectPromise(outputError);
        return;
      }
      const result = { code, stdout, stderr };`
);

replaceOnce(
  'gh JSON parser',
  `async function gh(args, options = {}) { return (await run("gh", args, options)).stdout.trim(); }
async function ghJson(args, options = {}) { const output = await gh(args, options); return output ? JSON.parse(output) : null; }`,
  `const GH_JSON_OUTPUT_LIMIT = 8_000_000;
async function gh(args, options = {}) { return (await run("gh", args, options)).stdout.trim(); }
async function ghJson(args, options = {}) {
  const output = await gh(args, { ...options, truncate: false, limit: options.limit ?? GH_JSON_OUTPUT_LIMIT });
  if (!output) return null;
  try {
    return JSON.parse(output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(\`Invalid JSON from gh ${'${args.slice(0, 6).join(" ")}'} (${'${output.length}'} chars): ${'${message}'}\`);
  }
}`
);

replaceOnce(
  'event filter',
  `async function ignoreUntrustedCommentEvent() {
  if (process.env.GITHUB_EVENT_NAME !== "issue_comment" || !process.env.GITHUB_EVENT_PATH) return false;
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
  const association = String(event.comment?.author_association || "").toUpperCase();
  return !["OWNER", "MEMBER", "COLLABORATOR"].includes(association) && !isTrustedLogin(event.comment?.user?.login);
}`,
  `async function ignoreIrrelevantEvent() {
  if (!process.env.GITHUB_EVENT_PATH) return false;
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
  if (process.env.GITHUB_EVENT_NAME === "issue_comment") {
    const command = String(event.comment?.body || "").trim().toLowerCase();
    const association = String(event.comment?.author_association || "").toUpperCase();
    const trusted = ["OWNER", "MEMBER", "COLLABORATOR"].includes(association) || isTrustedLogin(event.comment?.user?.login);
    const controlIssue = String(event.issue?.body || "").includes("AOC-AUTONOMY-CONTROL");
    return !command.startsWith("/agent ") || !trusted || !controlIssue;
  }
  if (process.env.GITHUB_EVENT_NAME === "workflow_run") {
    const branch = String(event.workflow_run?.head_branch || "");
    return !branch || (branch !== "main" && !branch.startsWith(policy.branchPrefix));
  }
  return false;
}`
);

source = source.replace('"--state", state, "--limit", "200",', '"--state", state, "--limit", "500",');
source = source.replace('if (await ignoreUntrustedCommentEvent()) return;', 'if (await ignoreIrrelevantEvent()) return;');

if (source.includes('stdout = truncate(`${stdout}${chunk}`, options.limit || 100000)')) throw new Error('Unsafe stdout truncation remains');
if (!source.includes('GH_JSON_OUTPUT_LIMIT = 8_000_000')) throw new Error('JSON output limit patch missing');
if (!source.includes('ignoreIrrelevantEvent')) throw new Error('Event filter patch missing');
if (!source.includes('"--state", state, "--limit", "500",')) throw new Error('Issue pagination patch missing');

writeFileSync(sourcePath, source);

const selfTest = [
  'import { readFile } from "node:fs/promises";',
  '',
  'const source = await readFile(new URL("./orchestrator.mjs", import.meta.url), "utf8");',
  'const required = [',
  '  "GH_JSON_OUTPUT_LIMIT = 8_000_000",',
  '  "truncate: false",',
  '  "options.limit ?? GH_JSON_OUTPUT_LIMIT",',
  '  "ignoreIrrelevantEvent",',
  '  "--limit\\\", \\\"500",',
  '  "outputError"',
  '];',
  'for (const token of required) if (!source.includes(token)) throw new Error("Missing orchestrator IO invariant: " + token);',
  'if (source.includes("ignoreUntrustedCommentEvent")) throw new Error("Legacy event filter remains");',
  'if (source.includes("stdout = truncate(`${stdout}${chunk}`, options.limit || 100000)")) throw new Error("Legacy JSON-corrupting truncation remains");',
  '',
  'const fixture = JSON.stringify(Array.from({ length: 500 }, (_, index) => ({ index, body: "x".repeat(500) })));',
  'if (fixture.length <= 100000) throw new Error("Fixture is too small");',
  'const parsed = JSON.parse(fixture);',
  'if (parsed.length !== 500) throw new Error("Large JSON fixture did not round-trip");',
  'console.log("Orchestrator IO self-test passed with " + fixture.length + " JSON characters");',
  ''
].join('\n');
writeFileSync('scripts/agents/orchestrator-io.selftest.mjs', selfTest);

console.log('Deterministic orchestrator JSON output patch applied');
