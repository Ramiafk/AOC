const { readFileSync, writeFileSync } = require('node:fs');

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Expected ${label} block not found`);
  return source.replace(before, after);
}

// Runtime: meaningful 429 backoff and an explicit finalization warning.
{
  const path = 'scripts/agents/agent-runtime.mjs';
  let source = readFileSync(path, 'utf8');
  const before = `async function callModel(messages, tools) {
  const endpoint = process.env.GITHUB_MODELS_ENDPOINT || "https://models.github.ai/inference/chat/completions";
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const aggressive = attempt >= 2;
    const requestMessages = compactMessages(messages, aggressive);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Accept: "application/vnd.github+json", Authorization: \`Bearer \${token}\`, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: requestMessages, tools, tool_choice: "auto", temperature: role.mode === "write" ? 0.2 : 0.1, max_tokens: aggressive ? Math.min(maxResponseTokens, 1000) : maxResponseTokens })
    });
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
    if (response.ok) return payload;
    lastError = new Error(\`GitHub Models \${response.status}: \${JSON.stringify(payload).slice(0, 2000)}\`);
    if (![408, 413, 429, 500, 502, 503, 504].includes(response.status)) break;
    await new Promise(resolvePromise => setTimeout(resolvePromise, attempt * 2000));
  }
  throw lastError;
}`;
  const after = `async function callModel(messages, tools) {
  const endpoint = process.env.GITHUB_MODELS_ENDPOINT || "https://models.github.ai/inference/chat/completions";
  const maxAttempts = Math.min(Math.max(Number(policy.maxModelAttempts || 5), 1), 7);
  const rateLimitBaseDelayMs = Math.min(Math.max(Number(policy.githubModels429BaseDelayMs || 30000), 5000), 120000);
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const aggressive = attempt >= 2;
    const requestMessages = compactMessages(messages, aggressive);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Accept: "application/vnd.github+json", Authorization: \`Bearer \${token}\`, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: requestMessages, tools, tool_choice: "auto", temperature: role.mode === "write" ? 0.2 : 0.1, max_tokens: aggressive ? Math.min(maxResponseTokens, 1000) : maxResponseTokens })
    });
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
    if (response.ok) return payload;
    lastError = new Error(\`GitHub Models \${response.status}: \${JSON.stringify(payload).slice(0, 2000)}\`);
    if (![408, 413, 429, 500, 502, 503, 504].includes(response.status) || attempt === maxAttempts) break;
    const retryAfterSeconds = Number(response.headers.get("retry-after") || 0);
    const exponentialDelay = response.status === 429
      ? rateLimitBaseDelayMs * (2 ** (attempt - 1))
      : Math.min(2000 * attempt, 15000);
    const delayMs = Math.min(Math.max(retryAfterSeconds * 1000, exponentialDelay), 120000);
    console.warn(\`[AOC-MODEL-BACKOFF] status=\${response.status} attempt=\${attempt}/\${maxAttempts} delay_ms=\${delayMs}\`);
    await new Promise(resolvePromise => setTimeout(resolvePromise, delayMs));
  }
  throw lastError;
}`;
  source = replaceOnce(source, before, after, 'callModel');
  const loopBefore = `for (let turn = 1; turn <= maxTurns && !finalResult; turn += 1) {
  const payload = await callModel(messages, tools);`;
  const loopAfter = `for (let turn = 1; turn <= maxTurns && !finalResult; turn += 1) {
  if (turn === Math.max(2, maxTurns - 1)) {
    messages.push({ role: "user", content: "Two model turns remain. Stop exploring. Use only evidence already collected, perform at most one essential write, then call finish with a concise truthful result." });
  }
  const payload = await callModel(messages, tools);`;
  source = replaceOnce(source, loopBefore, loopAfter, 'agent finalization warning');
  writeFileSync(path, source);
}

// Orchestrator: throttle sequential agents to avoid bursting GitHub Models.
{
  const path = 'scripts/agents/orchestrator.mjs';
  let source = readFileSync(path, 'utf8');
  const roleAnchor = `const REVIEW_ROLES = new Set(["security_engineer", "accessibility_performance_reviewer", "legal_compliance_advisor", "finance_fraud_advisor"]);`;
  source = replaceOnce(source, roleAnchor, `${roleAnchor}\nconst interAgentDelayMs = Math.min(Math.max(Number(policy.interAgentDelayMs || 12000), 0), 60000);`, 'inter-agent delay declaration');
  const returnBefore = `  return { report, reportPath, process: result };
}`;
  const returnAfter = `  if (interAgentDelayMs > 0) await new Promise(resolvePromise => setTimeout(resolvePromise, interAgentDelayMs));
  return { report, reportPath, process: result };
}`;
  source = replaceOnce(source, returnBefore, returnAfter, 'runAgent delay');
  writeFileSync(path, source);
}

// Policy: bounded retry and pacing values.
{
  const path = 'config/agents/policy.json';
  const policy = JSON.parse(readFileSync(path, 'utf8'));
  policy.maxModelAttempts = 5;
  policy.githubModels429BaseDelayMs = 30000;
  policy.interAgentDelayMs = 12000;
  writeFileSync(path, `${JSON.stringify(policy, null, 2)}\n`);
}

// Planning roles must finish instead of browsing until the hard turn ceiling.
{
  const path = 'config/agents/roles.json';
  const roles = JSON.parse(readFileSync(path, 'utf8'));
  const limits = {
    product_director: 8,
    automotive_domain_expert: 10,
    ux_researcher: 8,
    ui_graphic_designer: 10,
    solution_architect: 10,
    technical_writer: 8,
    customer_success_operations: 8,
    growth_seo_advisor: 8
  };
  for (const [name, limit] of Object.entries(limits)) roles.roles[name].maxTurns = limit;
  roles.roles.product_director.instructions += ' Inspecte au maximum les fichiers strictement necessaires, ecris une seule specification de lot consolidee, puis appelle finish sans boucle exploratoire.';
  writeFileSync(path, `${JSON.stringify(roles, null, 2)}\n`);
}

// Permanent self-test.
writeFileSync('scripts/agents/model-resilience.selftest.mjs', `import { readFile } from "node:fs/promises";
const runtime = await readFile(new URL("./agent-runtime.mjs", import.meta.url), "utf8");
const orchestrator = await readFile(new URL("./orchestrator.mjs", import.meta.url), "utf8");
const policy = JSON.parse(await readFile(new URL("../../config/agents/policy.json", import.meta.url), "utf8"));
const roles = JSON.parse(await readFile(new URL("../../config/agents/roles.json", import.meta.url), "utf8"));
for (const token of ["AOC-MODEL-BACKOFF", "retry-after", "Two model turns remain", "maxModelAttempts", "githubModels429BaseDelayMs"]) {
  if (!runtime.includes(token)) throw new Error("Missing runtime resilience invariant: " + token);
}
if (!orchestrator.includes("interAgentDelayMs")) throw new Error("Missing inter-agent pacing");
if (policy.maxModelAttempts < 3 || policy.maxModelAttempts > 7) throw new Error("Unsafe model attempt policy");
if (policy.githubModels429BaseDelayMs < 15000) throw new Error("429 backoff is too short");
if (policy.interAgentDelayMs < 5000) throw new Error("Inter-agent delay is too short");
if (roles.roles.product_director.maxTurns > 10) throw new Error("Product planning loop is too large");
console.log("Model resilience self-test passed");
`);

console.log('Autonomy rate-limit resilience patch applied');
