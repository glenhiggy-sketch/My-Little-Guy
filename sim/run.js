// End-user simulation runner.
//   node sim/run.js                       all scenarios on the jsdom device (what CI runs)
//   node sim/run.js --device ios          the same scenarios on the real iPhone via Appium (see sim/README.md)
//   node sim/run.js --only play-a-fight   one or more scenarios (comma separated)
// Every scenario gets a brand-new world (new character, new Sheet state, new vault file). Reports go to
// sim/reports/<run id>/ (report.md + report.json, plus screenshots on a device).
"use strict";
const fs = require("fs");
const path = require("path");
const scenarios = require("./scenarios");

const arg = (name, dflt) => { const i = process.argv.indexOf("--" + name); return i < 0 ? dflt : process.argv[i + 1]; };
const deviceKind = arg("device", "dom");
const only = (arg("only", "") || "").split(",").filter(Boolean);
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.join(__dirname, "reports", runId);

function checkBugsFile() {
	const f = path.join(__dirname, "BUGS.md"); if (!fs.existsSync(f)) return [];
	const names = new Set(scenarios.map((s) => s.name));
	return [...fs.readFileSync(f, "utf8").matchAll(/scenario:\s*`([^`]+)`/g)].map((m) => m[1]).filter((n) => !names.has(n));
}

async function makeWorld() {
	if (deviceKind === "dom") return require("./devices/dom").makeDomWorld();
	if (deviceKind === "ios") return require("./devices/ios").makeIosWorld({ runId, outDir });
	throw new Error("unknown --device " + deviceKind);
}

(async () => {
	const missing = checkBugsFile();
	if (missing.length) { console.error("BUGS.md names scenarios that do not exist: " + missing.join(", ")); process.exit(2); }
	fs.mkdirSync(outDir, { recursive: true });
	const results = [];
	for (const sc of scenarios) {
		if (only.length && !only.includes(sc.name)) continue;
		const res = { scenario: sc.name, story: sc.story, steps: [], status: "pass" };
		let w;
		try {
			w = await makeWorld();
			const missingCaps = (sc.needs || []).filter((c) => !w.device.capabilities.has(c));
			if (missingCaps.length) { res.status = "skip"; res.reason = "device lacks: " + missingCaps.join(", "); }
			else {
				const step = async (name, fn) => {
					const s = { name, status: "pass" }; res.steps.push(s);
					try { await fn(); } catch (e) { s.status = "fail"; s.error = e.message; res.status = "fail"; try { s.screenshot = await w.device.screenshot(path.join(outDir, sc.name + "-" + res.steps.length + ".png")); } catch (e2) { /* best effort */ } throw e; }
				};
				await sc.run({ device: w.device, world: w.world, step });
			}
		} catch (e) {
			if (res.status !== "fail") { res.status = "fail"; res.steps.push({ name: "(setup/unexpected)", status: "fail", error: e.stack || e.message }); }
		} finally {
			try { if (w) { await w.world.cleanup(); if (w.device.close) await w.device.close(); } } catch (e) { /* cleanup is best effort, but tell the report */ res.cleanupError = e.message; }
		}
		results.push(res);
		const mark = { pass: "PASS", fail: "FAIL", skip: "skip" }[res.status];
		console.log(`  ${mark}  ${sc.name}${res.reason ? "  (" + res.reason + ")" : ""}`);
		res.steps.filter((s) => s.status === "fail").forEach((s) => console.log(`        - ${s.name}: ${String(s.error).split("\n")[0]}`));
	}
	const count = (s) => results.filter((r) => r.status === s).length;
	const md = [`# End-user simulation ${runId}`, "", `Device: **${deviceKind}** — ${count("pass")} passed, ${count("fail")} failed, ${count("skip")} skipped`, ""];
	results.forEach((r) => {
		md.push(`## ${r.status.toUpperCase()} — ${r.scenario}`, `_${r.story}_`, "");
		r.steps.forEach((s) => md.push(`- ${s.status === "pass" ? "✅" : "❌"} ${s.name}${s.error ? "\n  - " + String(s.error).split("\n")[0] : ""}${s.screenshot ? "\n  - screenshot: " + path.basename(s.screenshot) : ""}`));
		if (r.reason) md.push(`- skipped: ${r.reason}`);
		md.push("");
	});
	fs.writeFileSync(path.join(outDir, "report.md"), md.join("\n"));
	fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify({ runId, device: deviceKind, results }, null, 2));
	console.log(`\n${count("pass")} passed, ${count("fail")} failed, ${count("skip")} skipped. Report: ${path.relative(process.cwd(), outDir)}`);
	process.exit(count("fail") ? 1 : 0);
})();
