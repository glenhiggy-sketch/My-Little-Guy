// Loads main.js like the test harness does and exposes the sheet parser, so the audit can see exactly what the plugin extracts.
"use strict";
const fs = require("fs"), path = require("path");
const { JSDOM } = require("jsdom");
const code = fs.readFileSync(path.join(__dirname, "..", "..", "main.js"), "utf8") + "\nmodule.exports.__parse = parseSheetBody;";
const win = new JSDOM("").window; global.window = win; global.document = win.document;
const obsidian = { parseYaml: JSON.parse, Plugin: class {}, PluginSettingTab: class {}, Setting: class {}, MarkdownView: class {}, MarkdownRenderer: {}, Platform: {}, Notice: class {}, ItemView: class {}, Modal: class {}, requestUrl: async () => ({}) };
const mod = { exports: {} };
new Function("module", "exports", "require", code)(mod, mod.exports, (n) => (n === "obsidian" ? obsidian : require(n)));
module.exports = mod.exports.__parse;
if (require.main === module) {
	const f = process.argv[2]; const out = module.exports(fs.readFileSync(f, "utf8"));
	console.log(JSON.stringify(out, (k, v) => (typeof v === "string" && v.length > 140 ? v.slice(0, 140) + "…" : v), 1).slice(0, 6000));
}
