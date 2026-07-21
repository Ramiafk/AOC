import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const args = Object.fromEntries(process.argv.slice(2).filter((value) => value.startsWith("--")).map((value) => {
  const [key, ...rest] = value.slice(2).split("=");
  return [key, rest.join("=")];
}));
if (!args.input || !args.output || !args.sha) throw new Error("--input, --output and --sha are required");
const data = JSON.parse(await fs.readFile(path.resolve(args.input), "utf8"));
const decision = data.decision;
if (!["APPROVED_FOR_MERGE", "CHANGES_REQUIRED"].includes(decision)) throw new Error(`Invalid decision: ${decision}`);
if (decision === "APPROVED_FOR_MERGE" && data.blockingFindings?.length) throw new Error("Approved result cannot contain blocking findings");
if (decision === "CHANGES_REQUIRED" && !data.blockingFindings?.length) throw new Error("Changes-required result must contain at least one blocking finding");
const requiredChecks = ["businessRules", "authorization", "tenantIsolation", "transactions", "concurrency", "migrations", "postgresIntegrity", "tests", "documentation"];
if (!data.checked || requiredChecks.some((key) => typeof data.checked[key] !== "boolean")) throw new Error("CTO result has an incomplete checked section");
if (decision === "APPROVED_FOR_MERGE" && requiredChecks.some((key) => data.checked[key] !== true)) throw new Error("Approved result must confirm every mandatory CTO control");

const lines = [
  `<!-- AOS_AUTONOMY_CTO sha=${args.sha} decision=${decision} -->`,
  `## Décision CTO : **${decision}**`,
  "",
  `**Commit examiné :** \`${args.sha}\``,
  `**Validation autonome :** \`${args.run ?? "n/a"}\``,
  "",
  data.summary,
  "",
];

if (data.blockingFindings?.length) {
  lines.push("### Blocages", "");
  data.blockingFindings.forEach((finding, index) => {
    lines.push(
      `#### ${index + 1}. ${finding.title}`,
      "",
      `**Risque :** ${finding.risk}`,
      "",
      `**Scénario :** ${finding.scenario}`,
      "",
      `**Correction attendue :** ${finding.requiredFix}`,
      "",
      `**Test attendu :** ${finding.requiredTest}`,
      "",
      finding.paths?.length ? `**Chemins :** ${finding.paths.map((value) => `\`${value}\``).join(", ")}` : "",
      ""
    );
  });
}

if (data.recommendations?.length) {
  lines.push("### Recommandé prochainement", "", ...data.recommendations.map((value) => `- ${value}`), "");
}
if (data.strategicIdeas?.length) {
  lines.push("### Idées stratégiques", "", ...data.strategicIdeas.map((value) => `- ${value}`), "");
}

if (decision === "APPROVED_FOR_MERGE") {
  lines.push("La PR peut être fusionnée automatiquement. Le lot suivant ne démarrera qu’après la fusion effective.");
} else {
  lines.push("La PR reste en brouillon. L’agent développeur doit corriger cette même branche puis redemander une revue sur un nouveau SHA vert.");
}

await fs.mkdir(path.dirname(path.resolve(args.output)), { recursive: true });
await fs.writeFile(path.resolve(args.output), `${lines.filter((line) => line !== "").join("\n").replace(/\n{3,}/g, "\n\n")}\n`, "utf8");
