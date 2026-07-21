#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_POLICY = {
  maxGithubModelsRequestCharacters: 18000,
  maxGithubModelsResponseTokens: 800,
  maxTaskCharacters: 4500,
  maxConversationRounds: 1
};

async function loadPolicy() {
  try {
    const parsed = JSON.parse(await readFile(resolve(process.cwd(), "config/agents/policy.json"), "utf8"));
    return { ...DEFAULT_POLICY, ...parsed };
  } catch {
    return DEFAULT_POLICY;
  }
}

const POLICY = await loadPolicy();
const PATCH_MARKER = Symbol.for("aoc.githubModelsBudgetInstalled");

function truncateText(value, maximum) {
  if (typeof value !== "string") return value;
  if (value.length <= maximum) return value;
  return `${value.slice(0, Math.max(0, maximum - 48))}\n...[AOC context truncated: ${value.length - maximum} chars]`;
}

function compactTools(tools, descriptionLimit) {
  if (!Array.isArray(tools)) return tools;
  return tools.map(tool => ({
    type: tool.type,
    function: {
      name: tool.function?.name,
      description: truncateText(tool.function?.description || "Repository tool", descriptionLimit),
      parameters: tool.function?.parameters
    }
  }));
}

function groupConversation(messages) {
  const firstSystem = messages.find(message => message.role === "system") || { role: "system", content: "AOC autonomous agent." };
  const firstUserIndex = messages.findIndex(message => message.role === "user");
  const firstUser = firstUserIndex >= 0 ? messages[firstUserIndex] : { role: "user", content: "Inspect the repository and finish truthfully." };
  const start = firstUserIndex >= 0 ? firstUserIndex + 1 : 1;
  const rounds = [];
  for (let index = start; index < messages.length;) {
    if (messages[index].role !== "assistant") {
      index += 1;
      continue;
    }
    const round = [messages[index++]];
    while (index < messages.length && messages[index].role === "tool") round.push(messages[index++]);
    rounds.push(round);
  }
  return { firstSystem, firstUser, rounds };
}

function compactRound(round, limits) {
  return round.map(message => ({
    ...message,
    content: message.role === "tool"
      ? truncateText(message.content, limits.tool)
      : truncateText(message.content, limits.assistant)
  }));
}

function candidatePayload(payload, pass) {
  const { firstSystem, firstUser, rounds } = groupConversation(Array.isArray(payload.messages) ? payload.messages : []);
  const passConfig = [
    {
      keepRounds: Math.max(0, Math.min(Number(POLICY.maxConversationRounds) || 1, 2)),
      system: 1800,
      user: Number(POLICY.maxTaskCharacters) || 4500,
      assistant: 1200,
      tool: 2200,
      description: 140,
      responseTokens: Number(POLICY.maxGithubModelsResponseTokens) || 800
    },
    {
      keepRounds: 1,
      system: 1200,
      user: 3000,
      assistant: 650,
      tool: 1200,
      description: 80,
      responseTokens: 650
    },
    {
      keepRounds: 0,
      system: 800,
      user: 1800,
      assistant: 0,
      tool: 0,
      description: 40,
      responseTokens: 500
    }
  ][pass];

  const retained = passConfig.keepRounds
    ? rounds.slice(-passConfig.keepRounds).flatMap(round => compactRound(round, passConfig))
    : [];

  return {
    ...payload,
    max_tokens: Math.min(Number(payload.max_tokens) || passConfig.responseTokens, passConfig.responseTokens),
    messages: [
      { ...firstSystem, content: truncateText(firstSystem.content, passConfig.system) },
      { ...firstUser, content: truncateText(firstUser.content, passConfig.user) },
      ...(rounds.length > passConfig.keepRounds
        ? [{ role: "user", content: "Earlier tool rounds were discarded to stay inside the GitHub Models request limit. Re-read any evidence still required." }]
        : []),
      ...retained
    ],
    tools: compactTools(payload.tools, passConfig.description)
  };
}

export function fitGithubModelsPayload(payload, maximumCharacters = Number(POLICY.maxGithubModelsRequestCharacters) || 18000) {
  const originalCharacters = JSON.stringify(payload).length;
  for (let pass = 0; pass < 3; pass += 1) {
    const candidate = candidatePayload(payload, pass);
    const serialized = JSON.stringify(candidate);
    if (serialized.length <= maximumCharacters) {
      return { payload: candidate, serialized, originalCharacters, finalCharacters: serialized.length, pass };
    }
  }
  throw new Error(`GitHub Models request cannot fit the ${maximumCharacters}-character safety budget`);
}

function isGithubModelsRequest(input) {
  const value = typeof input === "string" ? input : input?.url;
  return typeof value === "string" && value.includes("models.github.ai/");
}

export function installGithubModelsBudget() {
  if (globalThis[PATCH_MARKER]) return;
  if (typeof globalThis.fetch !== "function") throw new Error("Global fetch is unavailable; GitHub Models budget cannot be installed");
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init = {}) => {
    if (!isGithubModelsRequest(input) || typeof init.body !== "string") return originalFetch(input, init);
    let parsed;
    try {
      parsed = JSON.parse(init.body);
    } catch {
      return originalFetch(input, init);
    }
    const fitted = fitGithubModelsPayload(parsed);
    if (fitted.finalCharacters !== fitted.originalCharacters) {
      console.log(`[AOC-GITHUB-MODELS-BUDGET] request ${fitted.originalCharacters} -> ${fitted.finalCharacters} chars; pass ${fitted.pass}`);
    }
    return originalFetch(input, { ...init, body: fitted.serialized });
  };
  globalThis[PATCH_MARKER] = true;
}

function selfTest() {
  const huge = {
    model: "openai/gpt-4.1",
    max_tokens: 2400,
    messages: [
      { role: "system", content: "S".repeat(6000) },
      { role: "user", content: "U".repeat(18000) },
      { role: "assistant", content: "A".repeat(7000), tool_calls: [{ id: "1", type: "function", function: { name: "read_file", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "1", content: "T".repeat(14000) }
    ],
    tools: [{ type: "function", function: { name: "read_file", description: "D".repeat(3000), parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } }]
  };
  const fitted = fitGithubModelsPayload(huge);
  if (fitted.finalCharacters > Number(POLICY.maxGithubModelsRequestCharacters)) throw new Error("Self-test exceeded request budget");
  if (fitted.payload.max_tokens > Number(POLICY.maxGithubModelsResponseTokens)) throw new Error("Self-test exceeded response budget");
  if (fitted.payload.tools?.[0]?.function?.name !== "read_file") throw new Error("Self-test lost tool identity");
  if (fitted.payload.messages[0]?.role !== "system" || fitted.payload.messages[1]?.role !== "user") throw new Error("Self-test lost base messages");
  console.log(`GitHub Models budget self-test passed: ${fitted.originalCharacters} -> ${fitted.finalCharacters} chars`);
}

const direct = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (direct) {
  if (process.argv.includes("--self-test")) selfTest();
  else console.log("Import this module with NODE_OPTIONS=--import=./scripts/agents/github-models-budget.mjs");
} else {
  installGithubModelsBudget();
}
