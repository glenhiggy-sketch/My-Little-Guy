// Copies the server logic (and its tests) from the Character Intake Apps Script project into test/vendor/appscript,
// so this repo's tests are self-contained. Run after changing the Apps Script:  node scripts/vendor-appscript.mjs
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const src = process.env.APPSCRIPT_DIR || "B:/New folder/plugin test.vault/Kadria Character Intake Clasp";
const dest = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "vendor", "appscript");
const files = ["Sync.js", "Publish.js", "TestHook.js", "test_fakes.js", "Sync.test.js", "Publish.test.js", "TestHook.test.js"];
if (!existsSync(join(src, "Sync.js"))) { console.error("Apps Script project not found at " + src + " (set APPSCRIPT_DIR)"); process.exit(1); }
mkdirSync(dest, { recursive: true });
for (const f of files) copyFileSync(join(src, f), join(dest, f));
console.log("vendored " + files.length + " files from " + src);
