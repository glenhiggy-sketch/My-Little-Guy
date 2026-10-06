// Publishes the current build as a GitHub PRE-release (x.y.z-rc.N) so BRAT on the test phone can install exactly this
// build. Pre-releases are not "latest", so normal BRAT users are not offered it. The real release stays blocked
// (scripts/release.mjs) until a full phone run passes on this exact build.
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sh = (cmd) => execFileSync(cmd, { stdio: "inherit", shell: true });
const out = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" }).trim();
if (out("git", ["status", "--porcelain"])) { console.error("Commit your changes first (working tree is dirty)."); process.exit(1); }
sh("npm test");

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const base = manifest.version;
const n = out("git", ["ls-remote", "--tags", "origin", base + "-rc.*"]).split("\n").filter((l) => /-rc\.\d+$/.test(l)).length + 1;
const tag = `${base}-rc.${n}`;
const dir = mkdtempSync(join(tmpdir(), "mlg-rc-"));
copyFileSync("main.js", join(dir, "main.js")); copyFileSync("styles.css", join(dir, "styles.css"));
writeFileSync(join(dir, "manifest.json"), JSON.stringify({ ...manifest, version: tag }, null, 2)); // BRAT wants the asset version to match the tag

execFileSync("git", ["push", "origin", "HEAD:main"], { stdio: "inherit" });
const sha = out("git", ["rev-parse", "HEAD"]);
execFileSync("gh", ["release", "create", tag, join(dir, "main.js"), join(dir, "manifest.json"), join(dir, "styles.css"), "--prerelease", "--target", sha, "--title", tag + " (test build)", "--notes", "Pre-release test build for the end-user simulation on the test iPhone. Not for general use."], { stdio: "inherit" });
console.log(`\nCandidate ${tag} published as a pre-release.\nOn the phone: BRAT > Add beta plugin > glenhiggy-sketch/My-Little-Guy > version ${tag}. Then: npm run sim:ios`);
