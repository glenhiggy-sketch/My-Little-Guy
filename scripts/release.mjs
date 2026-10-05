// Release checklist as code.
//   node scripts/release.mjs --check     versions/changelog/versions.json agree (CI runs this)
//   node scripts/release.mjs             check, run the tests, tag, push, and publish the GitHub release (BRAT reads it)
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const read = (f) => readFileSync(f, "utf8");
const manifest = JSON.parse(read("manifest.json"));
const pkg = JSON.parse(read("package.json"));
const versions = JSON.parse(read("versions.json"));
const v = manifest.version;
const problems = [];
if (pkg.version !== v) problems.push(`package.json is ${pkg.version}, manifest.json is ${v}`);
if (!versions[v]) problems.push(`versions.json has no entry for ${v}`);
const log = read("CHANGELOG.md");
const m = new RegExp("^## \[?" + v.replace(/\./g, "\.") + "\]?.*$([\s\S]*?)(?=^## |(?![\s\S]))", "m").exec(log);
if (!m) problems.push(`CHANGELOG.md has no "## ${v}" entry`);
if (problems.length) { console.error("Not releasable:\n - " + problems.join("\n - ")); process.exit(1); }
console.log(`Release files agree on ${v}.`);
if (process.argv.includes("--check")) process.exit(0);

const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });
const out = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" }).trim();
if (out("git", ["status", "--porcelain"])) { console.error("Commit your changes first (working tree is dirty)."); process.exit(1); }
execFileSync("npm test", { stdio: "inherit", shell: true });
if (out("git", ["tag", "--list", v])) { console.error(`Tag ${v} already exists.`); process.exit(1); }
run("git", ["tag", v]);
run("git", ["push", "origin", "main", v]);
run("gh", ["release", "create", v, "main.js", "manifest.json", "styles.css", "--title", v, "--notes", m[1].trim()]);
console.log(`Released ${v}. BRAT users get it on their next update check.`);
