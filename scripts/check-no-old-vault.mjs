// Fails if anything in this repo or in the Kadria appscript repo still points at the retired "plugin test" vault.
// The old vault is archived (B:/New folder/Kadria Archive Sandbox/plugin-test.vault-full) and everything needed from it now lives in
// C:/Kadria.vault and the Kadria appscript repo, so no code, script or config may read it again.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("..", import.meta.url));
const roots = [here, process.env.APPSCRIPT_DIR || "B:/New folder/Second Brain.vault/_Agent-Only/code/kadria-appscript"];
const needle = /plugin test(\.vault|[\\/])/i;                       // a path to it, not prose about it
const skipDirs = new Set([".git", "node_modules", "tool-results"]);
const textExt = /\.(js|mjs|cjs|ts|json|py|html|md|bat|ps1|sh|yml|yaml|txt)$/i;
// Files that name the old vault on purpose (they are the retirement tooling and its records).
const allowed = new Set(["sim/audit/retire_plugin_vault.py", "scripts/check-no-old-vault.mjs", "sim/audit/plugin-vault-extraction-record.json",
  "sim/audit/plugin-vault-audit.json", "sim/audit/plugin-vault-body-diffs.json", "CHANGELOG.md"]);

const hits = [];
function walk(dir, root) {
  for (const name of readdirSync(dir)) {
    if (skipDirs.has(name)) continue;
    const p = join(dir, name), st = statSync(p);
    if (st.isDirectory()) { walk(p, root); continue; }
    if (!textExt.test(name) || st.size > 3e6) continue;
    const rel = relative(root, p).replace(/\\/g, "/");
    if (root === here && allowed.has(rel)) continue;
    const lines = readFileSync(p, "utf8").split(/\r?\n/);
    lines.forEach((l, i) => { if (needle.test(l)) hits.push(`${rel}:${i + 1}: ${l.trim().slice(0, 140)}`); });
  }
}
for (const r of roots) if (existsSync(r)) walk(r, r);
if (hits.length) { console.error("Still pointing at the retired plugin test vault:\n  " + hits.join("\n  ")); process.exit(1); }
console.log("no references to the retired plugin test vault");
