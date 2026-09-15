#!/usr/bin/env node
/**
 * Live evaluation harness for the AI employee.
 *
 * This calls the real model and SPENDS REAL MONEY. It is deliberately not part
 * of `npm test` or CI: the offline suite (npm test) covers guardrails, tool
 * validation and the agent loop deterministically and for free.
 *
 * Usage:
 *   node evals/run.mjs --estimate          # print a cost estimate, run nothing
 *   node evals/run.mjs --run               # actually run (asks for confirmation)
 *   node evals/run.mjs --run --yes         # run without the prompt
 *   node evals/run.mjs --run --category price_question
 *
 * Requires ANTHROPIC_API_KEY, plus a Supabase-backed org so the tools have real
 * catalogue/knowledge data to read.
 */
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const cases = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url), "utf8"));
const categoryFilter = valueOf("--category");
const selected = cases.categories
  .filter((c) => !categoryFilter || c.name === categoryFilter)
  .flatMap((c) => c.cases.map((k) => ({ ...k, category: c.name })));

// Claude Sonnet 5 list pricing (ADR-008). Update if pricing changes.
const INPUT_PER_MTOK = 2.0;
const OUTPUT_PER_MTOK = 10.0;
// Rough per-case shape: system + tools + retrieved context, then a short reply.
// Most cases make one tool round-trip, so the prompt is billed about twice.
const EST_INPUT_TOKENS = 4000 * 2;
const EST_OUTPUT_TOKENS = 350;

function estimate(count) {
  const input = (count * EST_INPUT_TOKENS * INPUT_PER_MTOK) / 1_000_000;
  const output = (count * EST_OUTPUT_TOKENS * OUTPUT_PER_MTOK) / 1_000_000;
  return { input, output, total: input + output };
}

const cost = estimate(selected.length);
console.log(`Cases selected: ${selected.length}`);
console.log(
  `Estimated cost: ~$${cost.total.toFixed(2)} (input ~$${cost.input.toFixed(2)}, output ~$${cost.output.toFixed(2)})`,
);
console.log("This is an estimate before prompt caching, which should reduce it.");

if (!has("--run")) {
  console.log("\nDry run. Re-run with --run to execute against the live model.");
  process.exit(0);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("\nANTHROPIC_API_KEY is not set. Refusing to run.");
  process.exit(1);
}

if (!has("--yes")) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `\nThis will spend roughly $${cost.total.toFixed(2)}. Type "yes" to continue: `,
  );
  rl.close();
  if (answer.trim().toLowerCase() !== "yes") {
    console.log("Aborted. Nothing was spent.");
    process.exit(0);
  }
}

console.error(
  [
    "",
    "Not wired to a live org yet.",
    "",
    "The harness needs an authenticated Supabase session so the tools read a real",
    "catalogue and knowledge base; wiring that up is a small amount of work once a",
    "Supabase project and seeded demo org exist (see tasks/13 seed/demo business).",
    "",
    "Until then use `npm test` for the deterministic suite, which covers the",
    "guardrails, tool dispatch, iteration cap and grounding checks without cost.",
  ].join("\n"),
);
process.exit(2);
