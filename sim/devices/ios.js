// "Device" backed by the real iPhone: Appium (XCUITest) on the Mac, reached through an SSH tunnel on 127.0.0.1:4723.
// Obsidian iOS is a web view, so every control is found by its accessibility label (the plugin sets aria-labels on the
// inputs and pips; buttons use their visible text). Plain fetch against the W3C WebDriver API, no client library.
//
// STATUS: written before the phone was reachable -- NOT yet run on a device. Expect small fixes on the first real run
// (see sim/README.md "First run on the phone"). The scenarios themselves are device-independent.
//
// Config: sim/ios.config.json (gitignored; copy sim/ios.config.example.json) or env vars of the same names.
"use strict";
const fs = require("fs");
const path = require("path");
const { makeLiveWorld } = require("../worlds/live");

function loadConfig() {
	const f = path.join(__dirname, "..", "ios.config.json");
	const c = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
	return {
		appium: process.env.APPIUM_URL || c.appium || "http://127.0.0.1:4723",
		udid: process.env.SIM_UDID || c.udid, xcodeOrgId: process.env.SIM_TEAM_ID || c.xcodeOrgId, wdaBundleId: c.wdaBundleId || "com.kadria.wda",
		bundleId: c.bundleId || "md.obsidian", vault: process.env.SIM_VAULT || c.vault || "Kadria",
	};
}

class IosDevice {
	constructor(cfg, outDir) { this.cfg = cfg; this.outDir = outDir; this.name = "ios"; this.capabilities = new Set(["commands"]); this.sid = null; }
	async call(method, p, body) {
		const r = await fetch(this.cfg.appium + p, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
		const j = await r.json().catch(() => ({}));
		if (!r.ok) throw new Error(`Appium ${method} ${p}: ${(j.value && j.value.message) || r.status}`);
		return j.value;
	}
	sess(method, p, body) { return this.call(method, "/session/" + this.sid + p, body); }
	async start() {
		if (this.sid) return;
		const c = this.cfg;
		const v = await this.call("POST", "/session", { capabilities: { alwaysMatch: {
			platformName: "iOS", "appium:automationName": "XCUITest", "appium:udid": c.udid, "appium:bundleId": c.bundleId, "appium:noReset": true,
			"appium:newCommandTimeout": 3600, "appium:xcodeOrgId": c.xcodeOrgId, "appium:xcodeSigningId": "Apple Development", "appium:updatedWDABundleId": c.wdaBundleId,
			"appium:allowProvisioningDeviceRegistration": true, "appium:wdaLaunchTimeout": 240000, "appium:wdaConnectionTimeout": 240000,
		} } });
		this.sid = v.sessionId;
	}
	async close() { if (this.sid) { await this.call("DELETE", "/session/" + this.sid).catch(() => {}); this.sid = null; } }
	async script(name, args) { return this.sess("POST", "/execute/sync", { script: name, args: [args || {}] }); }
	async element(label, nth = 0) {
		const els = await this.sess("POST", "/elements", { using: "accessibility id", value: label });
		if (!els[nth]) throw new Error(`nothing on screen called "${label}"${nth ? " #" + nth : ""}`);
		return Object.values(els[nth])[0];
	}
	async elements(label) { return this.sess("POST", "/elements", { using: "accessibility id", value: label }); }
	/** Fresh install of the character note, the way the live world delivers it: Obsidian's own obsidian://new link creates the
	 *  note with the generated sheet's full text (proven on the phone 2026-10-06, ~9KB URL is fine). */
	async install(file, text) {
		await this.start();
		const url = `obsidian://new?vault=${encodeURIComponent(this.cfg.vault)}&name=${encodeURIComponent(file.replace(/\.md$/, ""))}&content=${encodeURIComponent(text)}`;
		await this.script("mobile: deepLink", { url, bundleId: this.cfg.bundleId }); await this.wait(2500);
	}
	/** Opens the character panel from a cold start: relaunch Obsidian, then open the character note by deep link. */
	async open() {
		await this.start();
		await this.script("mobile: terminateApp", { bundleId: this.cfg.bundleId }).catch(() => {});
		await this.script("mobile: launchApp", { bundleId: this.cfg.bundleId });
		if (this.character) await this.script("mobile: deepLink", { url: `obsidian://open?vault=${encodeURIComponent(this.cfg.vault)}&file=${encodeURIComponent(this.character.file)}`, bundleId: this.cfg.bundleId });
		await this.runCommand("My Little Guy: Open character panel").catch(() => {}); // best effort; the panel may already be open
		await this.wait();
	}
	async reopen() { return this.open(); }
	/** Open the character note (obsidian://open) while the panel is already open. */
	async openNote() { await this.script("mobile: deepLink", { url: `obsidian://open?vault=${encodeURIComponent(this.cfg.vault)}&file=${encodeURIComponent(this.character.file)}`, bundleId: this.cfg.bundleId }); await this.wait(2500); }
	wait(ms = 1200) { return new Promise((r) => setTimeout(r, ms)); }
	/** All visible text: the label/value attributes of the accessibility tree. */
	async readText() {
		const src = await this.sess("GET", "/source");
		return [...String(src).matchAll(/(?:label|value)="([^"]*)"/g)].map((m) => m[1]).join(" ").replace(/&amp;/g, "&").replace(/&apos;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
	}
	// The scenarios call text()/value() synchronously on the dom device; here they are async, so the runner awaits them.
	async text() { return this.readText(); }
	async notices() { return []; } // TODO(phone): Obsidian notices are toasts; read them from the source right after the action
	async tap(label, o = {}) { const e = await this.element(label, o.nth || 0); await this.sess("POST", `/element/${e}/click`, {}); await this.wait(); }
	async type(label, value, o = {}) {
		const els = await this.elements(label); const el = Object.values(o.nth === "last" ? els[els.length - 1] : els[o.nth || 0] || {})[0];
		if (!el) throw new Error(`no field called "${label}"`);
		await this.sess("POST", `/element/${el}/click`, {}); await this.sess("POST", `/element/${el}/clear`, {});
		await this.sess("POST", `/element/${el}/value`, { text: String(value) });
		await this.script("mobile: hideKeyboard", { keys: ["Done", "Return"] }).catch(() => {}); // blur => the plugin's change handler runs
		await this.wait();
	}
	async value(label, o = {}) {
		const els = await this.elements(label); const el = Object.values(o.nth === "last" ? els[els.length - 1] : els[o.nth || 0] || {})[0];
		if (!el) throw new Error(`no field called "${label}"`);
		return this.sess("GET", `/element/${el}/attribute/value`);
	}
	async goToPage(fragment) { await this.tap(fragment); }
	async runCommand(name) { await this.script("mobile: deepLink", { url: `obsidian://adv-uri?vault=${encodeURIComponent(this.cfg.vault)}&commandname=${encodeURIComponent(name)}`, bundleId: this.cfg.bundleId }); await this.wait(); }
	async setOffline() { throw new Error("offline is not driven on the phone"); }
	async screenshot(file) { const b64 = await this.sess("GET", "/screenshot"); fs.writeFileSync(file, Buffer.from(b64, "base64")); return file; }
}

async function makeIosWorld({ runId, outDir }) {
	const cfg = loadConfig();
	if (!cfg.udid || !cfg.xcodeOrgId) throw new Error("sim/ios.config.json needs udid and xcodeOrgId (see sim/ios.config.example.json)");
	const device = new IosDevice(cfg, outDir);
	const world = await makeLiveWorld({ runId });
	device.character = world.character; // the note the phone must open
	return { device, world };
}

module.exports = { makeIosWorld, IosDevice };
