import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const STATE_PATH = resolve(process.cwd(), ".agent", "github-models-rate-limit.json");
const PATCH_MARKER = Symbol.for("aoc.githubModelsResilienceInstalled");
const MIN_INTERVAL_MS = 15000;
const MAX_ATTEMPTS = 4;
const BASE_429_DELAY_MS = 30000;

function isGithubModelsRequest(input) {
  const value = typeof input === "string" ? input : input?.url;
  return typeof value === "string" && value.includes("models.github.ai/");
}

async function sleep(ms) {
  await new Promise(resolvePromise => setTimeout(resolvePromise, ms));
}

async function readLastRequestAt() {
  try {
    const parsed = JSON.parse(await readFile(STATE_PATH, "utf8"));
    return Number(parsed.lastRequestAt || 0);
  } catch {
    return 0;
  }
}

async function reserveRequestSlot() {
  await mkdir(dirname(STATE_PATH), { recursive: true });
  const lastRequestAt = await readLastRequestAt();
  const now = Date.now();
  const waitMs = Math.max(0, MIN_INTERVAL_MS - (now - lastRequestAt));
  if (waitMs > 0) await sleep(waitMs);
  const reservedAt = Date.now();
  await writeFile(STATE_PATH, `${JSON.stringify({ lastRequestAt: reservedAt })}\n`, "utf8");
}

function hardenPayload(body) {
  if (typeof body !== "string") return body;
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return body;
  }
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const assistantRounds = messages.filter(message => message?.role === "assistant").length;
  if (assistantRounds >= 4) {
    payload.messages = [
      ...messages,
      {
        role: "user",
        content: "Stop exploring. Use the evidence already collected, perform at most one essential write, then call finish with a concise truthful result."
      }
    ];
  }
  if (assistantRounds >= 6) {
    payload.tool_choice = { type: "function", function: { name: "finish" } };
  }
  return JSON.stringify(payload);
}

export function installGithubModelsResilience() {
  if (globalThis[PATCH_MARKER]) return;
  if (typeof globalThis.fetch !== "function") throw new Error("Global fetch is unavailable");
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init = {}) => {
    if (!isGithubModelsRequest(input)) return originalFetch(input, init);
    const hardenedBody = hardenPayload(init.body);
    let lastResponse;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      await reserveRequestSlot();
      const response = await originalFetch(input, { ...init, body: hardenedBody });
      lastResponse = response;
      if (response.status !== 429 || attempt === MAX_ATTEMPTS) return response;
      const retryAfterSeconds = Number(response.headers.get("retry-after") || 0);
      const delayMs = Math.min(
        Math.max(retryAfterSeconds * 1000, BASE_429_DELAY_MS * (2 ** (attempt - 1))),
        120000
      );
      console.warn(`[AOC-MODEL-BACKOFF] status=429 attempt=${attempt}/${MAX_ATTEMPTS} delay_ms=${delayMs}`);
      await sleep(delayMs);
    }
    return lastResponse;
  };
  globalThis[PATCH_MARKER] = true;
}

function selfTest() {
  const payload = {
    model: "openai/gpt-4.1",
    messages: [
      { role: "system", content: "system" },
      { role: "user", content: "task" },
      ...Array.from({ length: 6 }, (_, index) => ({ role: "assistant", content: `round-${index}` }))
    ],
    tools: [{ type: "function", function: { name: "finish", parameters: { type: "object" } } }]
  };
  const hardened = JSON.parse(hardenPayload(JSON.stringify(payload)));
  if (hardened.tool_choice?.function?.name !== "finish") throw new Error("Finish was not forced after six rounds");
  if (!hardened.messages.some(message => message.role === "user" && message.content.includes("Stop exploring"))) {
    throw new Error("Finalization guidance is missing");
  }
  console.log("GitHub Models resilience self-test passed");
}

const direct = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (direct) {
  if (process.argv.includes("--self-test")) selfTest();
  else console.log("Load with NODE_OPTIONS=--import=./scripts/agents/github-models-resilience.mjs");
} else {
  installGithubModelsResilience();
}
