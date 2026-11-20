#!/usr/bin/env node
/**
 * dimacs-to-lean.mjs — Convert DIMACS CNF to Lean 4 SyntacticCNF definitions.
 *
 * Usage:
 *   node dimacs-to-lean.mjs <file.cnf> [--name <id>] [--assignment <file>] [--chunk <n>]
 *
 * Options:
 *   --name <id>       Lean identifier (default: derived from filename)
 *   --assignment <f>  Read an assignment file (line 1 `SAT`, line 2 the signed
 *                     literals) and verify it against the CNF
 *   --chunk <n>       Clauses per chunk (default: 100). Large CNFs are
 *                     split into chunks and concatenated to avoid Lean's
 *                     maxRecDepth limit on deeply nested List.cons.
 *
 * Output: Lean 4 source to stdout.
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";

// --- CLI -----------------------------------------------------------------

const args = process.argv.slice(2);
if (!args.length || args[0] === "--help") {
  console.error("Usage: node dimacs-to-lean.mjs <file.cnf> [--name id] [--assignment file] [--chunk n]");
  process.exit(1);
}

const cnfPath = args[0];
let name = basename(cnfPath, ".cnf").replace(/[^a-zA-Z0-9]/g, "_");
let assignmentPath = null;
let chunkSize = 100;

for (let i = 1; i < args.length; i++) {
  if (args[i] === "--name" && args[i + 1]) name = args[++i];
  else if (args[i] === "--assignment" && args[i + 1]) assignmentPath = args[++i];
  else if (args[i] === "--chunk" && args[i + 1]) chunkSize = parseInt(args[++i], 10);
  else { console.error(`Unknown option: ${args[i]}`); process.exit(1); }
}

// --- Parse DIMACS --------------------------------------------------------

function parseDimacs(text) {
  const clauses = [];
  let nvars = 0;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line[0] === "c" || line[0] === "%") continue;
    if (line[0] === "p") {
      nvars = parseInt(line.split(/\s+/)[2], 10);
      continue;
    }
    const lits = line.split(/\s+/).map(Number).filter((x) => x !== 0);
    if (lits.length) clauses.push(lits);
  }
  return { nvars, clauses };
}

// --- Parse + verify assignment -------------------------------------------

function parseAssignment(text, nvars) {
  const lines = text.trim().split("\n");
  if (lines[0] !== "SAT") return null;
  const vals = lines[1].split(/\s+/).map(Number).filter((x) => x !== 0);
  const bools = new Array(nvars).fill(false);
  for (const v of vals) bools[Math.abs(v) - 1] = v > 0;
  return bools;
}

function verify(clauses, bools) {
  for (let ci = 0; ci < clauses.length; ci++) {
    let sat = false;
    for (const l of clauses[ci]) {
      const v = bools[Math.abs(l) - 1];
      if ((l > 0 && v) || (l < 0 && !v)) { sat = true; break; }
    }
    if (!sat) { console.error(`ERROR: clause ${ci} not satisfied`); process.exit(1); }
  }
}

// --- Emit Lean -----------------------------------------------------------

function emitClause(k, cl) {
  const lits = cl.map((l) => {
    const idx = Math.abs(l) - 1;
    const pol = l > 0 ? "true" : "false";
    return `lit ${k} ${idx} ${pol}`;
  });
  return `   [${lits.join(", ")}]`;
}

function emitCNF(name, k, clauses) {
  const nChunks = Math.ceil(clauses.length / chunkSize);
  const lines = [];

  if (nChunks <= 1) {
    lines.push(`private def ${name} : SyntacticCNF ${k} :=`);
    lines.push("  [" + clauses.map((cl) => emitClause(k, cl)).join(",\n") + "]");
  } else {
    for (let ci = 0; ci < nChunks; ci++) {
      const chunk = clauses.slice(ci * chunkSize, (ci + 1) * chunkSize);
      lines.push(`private def ${name}_c${ci} : SyntacticCNF ${k} :=`);
      lines.push("  [" + chunk.map((cl) => emitClause(k, cl)).join(",\n") + "]");
      lines.push("");
    }
    const concat = Array.from({ length: nChunks }, (_, i) => `${name}_c${i}`).join(" ++ ");
    lines.push(`private def ${name} : SyntacticCNF ${k} := ${concat}`);
  }
  return lines.join("\n");
}

function emitAssignment(name, k, bools) {
  const rows = [];
  for (let i = 0; i < k; i += 8) {
    rows.push(bools.slice(i, i + 8).map((b) => b ? "true" : "false").join(","));
  }
  return `private def ${name}_assign : Vector Bool ${k} :=\n  #v[${rows.join(",\n     ")}]`;
}

// --- Main ----------------------------------------------------------------

const { nvars, clauses } = parseDimacs(readFileSync(cnfPath, "utf-8"));
const k = nvars;
const litsPerClause = clauses.length ? clauses[0].length : 0;

console.error(`${name}: ${k} vars, ${clauses.length} clauses, ${litsPerClause}-SAT`);

let bools = null;
if (assignmentPath) {
  bools = parseAssignment(readFileSync(assignmentPath, "utf-8"), k);
  if (bools) { verify(clauses, bools); console.error("Assignment verified"); }
  else console.error("No SAT assignment found");
}

// Output
const out = [];
out.push(`-- Source: ${basename(cnfPath)}`);
out.push(`-- ${k} variables, ${clauses.length} clauses, ${litsPerClause}-SAT`);
out.push(`-- clause/var ratio = ${(clauses.length / k).toFixed(3)}`);
out.push("");
out.push(emitCNF(name, k, clauses));
if (bools) { out.push(""); out.push(emitAssignment(name, k, bools)); }
out.push("");
console.log(out.join("\n"));
