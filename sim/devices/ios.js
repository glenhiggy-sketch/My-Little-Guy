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
		appium: process.env.WDA_URL || process.env.APPIUM_URL || c.appium || "http://127.0.0.1:4723", direct: !!process.env.WDA_URL,
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
		if (c.direct) { // wireless: talk to an already-running WebDriverAgent (see iphone-bridge README "Wireless")
			const r = await this.call("POST", "/session", { capabilities: { alwaysMatch: { bundleId: c.bundleId } } });
			this.sid = r.sessionId; return;
		}
		const v = await this.call("POST", "/session", { capabilities: { alwaysMatch: {
			platformName: "iOS", "appium:automationName": "XCUITest", "appium:udid": c.udid, "appium:bundleId": c.bundleId, "appium:noReset": true,
			"appium:newCommandTimeout": 3600, "appium:xcodeOrgId": c.xcodeOrgId, "appium:xcodeSigningId": "Apple Development", "appium:updatedWDABundleId": c.wdaBundleId,
			"appium:allowProvisioningDeviceRegistration": true, "appium:wdaLaunchTimeout": 240000, "appium:wdaConnectionTimeout": 240000,
		} } });
		this.sid = v.sessionId;
	}
	async close() { if (this.sid) { await this.call("DELETE", "/session/" + this.sid).catch(() => {}); this.sid = null; } }
	async script(name, args) {
		args = args || {};
		if (this.cfg.direct) { // WDA's own endpoints instead of Appium's "mobile:" scripts
			const m = { "mobile: launchApp": ["/wda/apps/launch", { bundleId: args.bundleId }], "mobile: terminateApp": ["/wda/apps/terminate", { bundleId: args.bundleId }],
				"mobile: deepLink": ["/url", { url: args.url }], "mobile: keys": ["/wda/keys", { value: args.keys }], "mobile: hideKeyboard": ["/wda/keyboard/dismiss", { keyNames: args.keys || ["Done"] }] }[name];
			if (!m) throw new Error("no direct-WDA mapping for " + name);
			return this.sess("POST", m[0], m[1]);
		}
		return this.sess("POST", "/execute/sync", { script: name, args: [args] });
	}
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
	/** Cold start, then open the character note and the My Little Guy panel through the command palette
	 *  (palette results are not accessibility elements, so the first result is tapped by position; iPhone 13: 390x844 pt). */
	async open() {
		await this.start();
		await this.script("mobile: terminateApp", { bundleId: this.cfg.bundleId }).catch(() => {});
		await this.script("mobile: launchApp", { bundleId: this.cfg.bundleId }); await this.wait(5000); // let Obsidian restore its workspace first
		const title = this.character ? this.character.file.replace(/\.md$/, "") : "";
		// The panel follows the active note, and a restored workspace still has the previous scenario's note and panel:
		// open our note, open the panel, and check what it is tracking. Retry if it is still on an old note.
		for (let attempt = 0; attempt < 3; attempt++) {
			if (this.character) {
				await this.script("mobile: deepLink", { url: `obsidian://open?vault=${encodeURIComponent(this.cfg.vault)}&file=${encodeURIComponent(title)}`, bundleId: this.cfg.bundleId });
				await this.waitForText(title, 30000);                   // the note is on screen
			}
			await this.wait(1500);
			await this.tapAt(320, 786);                                // bottom toolbar menu
			await this.waitForText("Open command palette", 8000);
			await this.tap("Open command palette"); await this.wait(1500);
			await this.script("mobile: keys", { keys: [..."Open My Little Guy"] }); await this.wait(2000);
			await this.tapAt(148, 133); await this.wait(2500);         // first palette result
			if (!title || (await this.readText()).includes(`Tracking: ${title}.md`)) break;
			if (attempt === 2) throw new Error(`the panel is tracking a different note than ${title}`);
		}
		await this.waitForStatus(120000);          // the automatic pull must land first, or it re-renders the panel under the player's fingers
	}
	async waitForStatus(ms) { // the first sync has landed: linked, or there are unsent changes, or something was sent
		const end = Date.now() + ms;
		while (Date.now() < end) { if (/Linked to the sheet|Unsent changes|Sent (just now|\d+ (min|h) ago)/.test(await this.readText())) return; await this.wait(1000); }
		throw new Error(`the first sync never settled within ${ms / 1000}s. Screen: ${(await this.readText()).replace(/^.*?Pin this file/, "…Pin this file").slice(0, 400)}`);
	}
	async waitForText(sub, ms) {
		const end = Date.now() + ms;
		while (Date.now() < end) { if ((await this.readText()).includes(sub)) return; await this.wait(1000); }
		throw new Error(`"${sub}" never appeared on the phone within ${ms / 1000}s. Screen: ${(await this.readText()).replace(/^.*?Pin this file/, "…Pin this file").slice(0, 600)}`);
	}
	async tapAt(x, y) {
		await this.sess("POST", "/actions", { actions: [{ type: "pointer", id: "finger", parameters: { pointerType: "touch" }, actions: [{ type: "pointerMove", duration: 0, x, y }, { type: "pointerDown", button: 0 }, { type: "pause", duration: 80 }, { type: "pointerUp", button: 0 }] }] });
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
	/** Obsidian's pop-up messages vanish after a few seconds: they are collected while waiting after a tap (see tap()). */
	async notices() { return (this._toasts || []).slice(); }
	async collectToasts(ms) {
		const end = Date.now() + ms;
		const known = /Your DM updated[^|]*?\.|Your DM awarded[^|]*?\.|Up to date with the sheet\.|Sent to the sheet\.|Couldn't reach the sheet[^|]*?\.|The sheet did not accept[^|]*?\.|You have unsent changes[^|]*?\.|Restored from the sheet\./g;
		this._toasts = this._toasts || [];
		let seenAt = 0;
		do {                                                    // keep watching until the sheet has answered (a toast appeared) and a moment more, or ms is up
			for (const m of (await this.readText()).match(known) || []) if (!this._toasts.includes(m)) { this._toasts.push(m); seenAt = Date.now(); }
			await this.wait(600);
		} while (Date.now() < end && !(seenAt && Date.now() - seenAt > 2500));
	}
	/** Like a player: scroll until the element is clear of the floating bottom toolbar (y > ~740) and the status bar. */
	async scrollIntoView(el) {
		for (let i = 0; i < 6; i++) {
			const r = await this.sess("GET", `/element/${el}/rect`).catch(() => null);
			if (!r || (r.y + r.height < 720 && r.y > 190)) return;
			const down = r.y + r.height >= 720;
			await this.sess("POST", "/actions", { actions: [{ type: "pointer", id: "finger", parameters: { pointerType: "touch" }, actions: [{ type: "pointerMove", duration: 0, x: 40, y: down ? 600 : 300 }, { type: "pointerDown", button: 0 }, { type: "pointerMove", duration: 350, x: 40, y: down ? 300 : 600 }, { type: "pointerUp", button: 0 }] }] });
			await this.wait(600);
		}
	}
	async tap(label, o = {}) { const e = await this.element(label, o.nth || 0); await this.scrollIntoView(e); await this.sess("POST", `/element/${e}/click`, {}); if (/ sheet$/.test(label)) { this._toasts = []; await this.collectToasts(90000); } else await this.wait(1200); } // sheet buttons make a real round trip to Google; watch for their pop-up messages meanwhile
	/** Centre of an on-screen keyboard key (found after the keyboard has finished sliding up). */
	async keyCenter(name) {
		const keys = await this.sess("POST", "/elements", { using: "predicate string", value: `type == 'XCUIElementTypeKey' AND name == '${name}'` });
		const el = Object.values(keys[0] || {})[0];
		if (!el) return null;
		const r = await this.sess("GET", `/element/${el}/rect`);
		return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
	}
	async type(label, value, o = {}) {
		const find = async () => { const els = await this.elements(label); return Object.values(o.nth === "last" ? els[els.length - 1] : els[o.nth || 0] || {})[0]; };
		for (let attempt = 0; ; attempt++) { // the panel may re-render between find and use; a player would just tap again
			try {
				const el = await find();
				if (!el) throw new Error(`no field called "${label}"`);
				await this.scrollIntoView(el);
				await this.sess("POST", `/element/${el}/click`, {}); await this.wait(1800); // keyboard slides up
				const r = await this.sess("GET", `/element/${await find()}/rect`);       // like a player: put the caret at the end of the number, delete it, type the new one
				const read = async () => { try { const v = await this.sess("GET", `/element/${await find()}/attribute/value`); return v === null || v === undefined ? "" : String(v); } catch (e) { return null; } }; // null = could not read
				const del = await this.keyCenter("delete");
				const probe = await this.keyCenter("9");
				const cy = Math.round(r.y + r.height / 2);
				if (del && !probe) {                                                  // a text field (letters keyboard): tap its end, delete what is there
					await this.tapAt(Math.round(r.x + r.width - 10), cy); await this.wait(450);
					const len = String((await read()) || "").length;
					for (let i = 0; i < len + 3; i++) { await this.tapAt(del.x, del.y); await this.wait(120); }
				}
				if (del && probe) {
					let atEnd = false;
					for (const dx of [7, 10, 14, 5, 20, 3]) {                        // tap, then prove where the caret is by typing a 9: it must come out last
						await this.tapAt(Math.round(r.x + r.width - dx), cy); await this.wait(450);
						const before = await read();
						await this.tapAt(probe.x, probe.y); await this.wait(350);
						const after = await read();
						await this.tapAt(del.x, del.y); await this.wait(300);             // remove the probe again (caret is just after it)
						if (after !== null && before !== null && after === before + "9") { atEnd = true; break; }
					}
					for (let i = 0; atEnd && i < 14 && (await read()) !== ""; i++) { await this.tapAt(del.x, del.y); await this.wait(250); }
					if (!atEnd || (await read()) !== "") { // could not prove the caret position (or the field would not empty): clear it through WDA instead of typing into the old number
						try { await this.sess("POST", `/element/${await find()}/clear`, {}); await this.wait(500); } catch (e) { /* the retry below will try again */ }
						await this.sess("POST", `/element/${await find()}/click`, {}); await this.wait(800);
					}
				}
				for (const ch of String(value)) {
					const find1 = async () => (await this.keyCenter(ch === " " ? "space" : ch)) || (await this.keyCenter(ch.toUpperCase()));
					let k = await find1();
					if (!k) {                                   // wrong layout (letters vs numbers): tap the layout key, like a player
						const sw = (await this.keyCenter("more")) || (await this.keyCenter("numbers")) || (await this.keyCenter("ABC")) || (await this.keyCenter("letters"));
						if (sw) { await this.tapAt(sw.x, sw.y); await this.wait(500); k = await find1(); }
					}
					if (!k) throw new Error(`no "${ch}" key on the keyboard`);
					await this.tapAt(k.x, k.y); await this.wait(150);
				}
				await this.tapAt(195, 69); // tap the tab title: the field loses focus and the plugin's change handler runs
				await this.wait(1200);
				const got = String(await this.value(label, o));
				if (got.toLowerCase() !== String(value).toLowerCase()) throw new Error(`typed ${value} into "${label}" but it reads ${got}`);
				return;
			} catch (e) { if (attempt >= 2) throw e; await this.wait(1500); }
		}
	}
	async value(label, o = {}) {
		for (let attempt = 0; ; attempt++) { // the panel can redraw between finding the field and reading it
			try {
				const els = await this.elements(label); const el = Object.values(o.nth === "last" ? els[els.length - 1] : els[o.nth || 0] || {})[0];
				if (!el) throw new Error(`no field called "${label}"`);
				const v = await this.sess("GET", `/element/${el}/attribute/value`);
				if ((v === "" || v === null || v === undefined) && attempt < 12) { await this.wait(1500); continue; } // an empty field is one the phone has not filled in yet (right after the app comes back)
				return v;
			} catch (e) { if (attempt >= 12) throw e; await this.wait(1000); }
		}
	}
	async goToPage(fragment) { // the page dots are labelled with the whole title, e.g. "🎒 Inventory"
		const using = this.cfg.direct ? "predicate string" : "-ios predicate string";
		const els = await this.sess("POST", "/elements", { using, value: `label CONTAINS '${fragment}' AND type == 'XCUIElementTypeButton'` });
		const el = Object.values(els[0] || {})[0];
		if (!el) throw new Error(`no page called "${fragment}"`);
		await this.sess("POST", `/element/${el}/click`, {}); await this.wait(1200);
	}
	async runCommand(name) { // through the command palette, like a player (the panel view shows the bottom toolbar)
		await this.tapAt(320, 786); await this.waitForText("Open command palette", 8000);
		await this.tap("Open command palette"); await this.wait(1500);
		await this.script("mobile: keys", { keys: [...name.replace(/ \(.*$/, "")] }); await this.wait(2000); // symbols are not on the letters keyboard: search by the part before any "("
		await this.tapAt(148, 133); await this.wait(2500);
	}
	async setOffline() { throw new Error("offline is not driven on the phone"); }
	async screenshot(file) { const b64 = await this.sess("GET", "/screenshot"); fs.writeFileSync(file, Buffer.from(b64, "base64")); return file; }
}

async function makeIosWorld({ runId, outDir }) {
	const cfg = loadConfig();
	if (!cfg.udid || !cfg.xcodeOrgId) throw new Error("sim/ios.config.json needs udid and xcodeOrgId (see sim/ios.config.example.json)");
	const device = new IosDevice(cfg, outDir);
	const world = await makeLiveWorld({ runId });
	device.character = world.character; // the note the phone must open
	await device.install(world.character.file, require("fs").readFileSync(world.character.path, "utf8"));
	return { device, world };
}

module.exports = { makeIosWorld, IosDevice };
