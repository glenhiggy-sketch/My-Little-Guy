// Hash of exactly what users install (main.js + manifest.json + styles.css). The release gate compares it with the
// hash recorded by a fully passing phone run (sim/last-device-pass.json).
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
module.exports = () => { const h = createHash("sha256"); for (const f of ["main.js", "manifest.json", "styles.css"]) h.update(readFileSync(path.join(root, f))); return h.digest("hex"); };
