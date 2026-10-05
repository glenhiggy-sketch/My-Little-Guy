// End-to-end test of My Little Guy's sheet sync WITHOUT a device or a network:
// the plugin's real view code (rendered into jsdom) talks, through an injected requestUrl, to the REAL
// Sync.js + Publish.js server logic (from the Apps Script project) running on an in-memory fake of Google Sheets.
// So field names, formats and ownership rules are checked on both sides of the wire.
//
// Run: node sync.test.js      (APPSCRIPT_DIR overrides where the Apps Script project lives)
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");
const { JSDOM } = require("jsdom");

const APPSCRIPT_DIR = process.env.APPSCRIPT_DIR || "B:/New folder/plugin test.vault/Kadria Character Intake Clasp";
const SAMPLE_SHEET = process.env.SAMPLE_SHEET || "B:/New folder/Kadria Archive Sandbox/kadria.vault/PCs/Character Intake/Aelen - Erin.md";
if (!fs.existsSync(APPSCRIPT_DIR + "/Sync.js") || !fs.existsSync(SAMPLE_SHEET)) { console.log("SKIPPED: Apps Script project or sample sheet not found"); process.exit(0); }

// ---------------------------------------------------------------- server: the real Apps Script logic on fakes
const { makeEnv } = require(APPSCRIPT_DIR + "/test_fakes.js");
const env = makeEnv();
vm.runInContext(fs.readFileSync(APPSCRIPT_DIR + "/Sync.js", "utf8"), env.ctx);
vm.runInContext(fs.readFileSync(APPSCRIPT_DIR + "/Publish.js", "utf8"), env.ctx);
const SV = vm.runInContext("({upsertDatabaseRow_, pullCharacter_, doPost, publishDmChanges, withSyncComment_, getCharactersSheet_, getAwardsSheet_, getPublishedSheet_, CHARACTERS_HEADERS})", env.ctx);
const J = (x) => JSON.parse(JSON.stringify(x));

// ---------------------------------------------------------------- DOM + obsidian stubs
const dom = new JSDOM("<!doctype html><body></body>");
const { window } = dom;
const P = window.HTMLElement.prototype;
P.createEl = function (tag, o) { o = o || {}; const e = this.ownerDocument.createElement(tag); if (o.cls) e.className = [].concat(o.cls).join(" "); if (o.text !== undefined) e.textContent = o.text; if (o.type) e.type = o.type; if (o.placeholder) e.placeholder = o.placeholder; if (o.title) e.title = o.title; this.appendChild(e); return e; };
P.createDiv = function (o) { return this.createEl("div", o); };
P.createSpan = function (o) { return this.createEl("span", o); };
P.empty = function () { this.textContent = ""; };
P.addClass = function (c) { this.classList.add(c); };
P.removeClass = function (c) { this.classList.remove(c); };
P.toggleClass = function (c, on) { this.classList.toggle(c, on === undefined ? undefined : !!on); };
P.setAttr = function (k, v) { this.setAttribute(k, v); };
P.setText = function (s) { this.textContent = s; };
P.createSvg = function (tag, o) { return this.createEl(tag, o); };

const notices = [];
let netDown = false;
const obsidian = {
	Plugin: class {}, PluginSettingTab: class {}, Setting: class {}, MarkdownView: class {}, MarkdownRenderer: {}, addIcon() {},
	Platform: { isMobile: false, isIosApp: false },
	Notice: class { constructor(m) { notices.push(String(m)); } },
	ItemView: class { constructor(leaf) { this.leaf = leaf; this.app = leaf.app; this.contentEl = window.document.createElement("div"); } registerEvent() {} },
	Modal: class { constructor(app) { this.app = app; this.contentEl = window.document.createElement("div"); } open() { Modal.last = this; this.onOpen(); } close() { this.onClose && this.onClose(); } },
	// routes the plugin's HTTP calls to the real server logic, like Apps Script's redirecting web app would
	requestUrl: async ({ url, method, body }) => {
		if (netDown) throw new Error("net::ERR_INTERNET_DISCONNECTED");
		const u = new URL(url);
		const res = method === "POST" ? SV.doPost({ postData: { contents: body } }) : u.searchParams.get("action") === "pull" ? SV.pullCharacter_(Object.fromEntries(u.searchParams)) : { ok: false, error: "unknown" };
		const text = JSON.stringify(J(res));
		return { status: 200, text, get json() { return JSON.parse(text); } };
	},
};
const Modal = obsidian.Modal;
const src = fs.readFileSync("C:/Users/glenh/My-Little-Guy/main.js", "utf8");
const mod = { exports: {} };
global.window = window; global.document = window.document;
new Function("module", "exports", "require", src)(mod, mod.exports, (n) => (n === "obsidian" ? obsidian : require(n)));
const { __sync: C, __CharacterHubView: View } = mod.exports;

// ---------------------------------------------------------------- a character, a vault file and a fake app around it
const character = SV.upsertDatabaseRow_({ characterName: "Aelen", playerName: "Erin", species: "Tortle", background: "Sage", className: "Wizard", alignment: "Neutral Good" },
	{ level: 3, hp: 20, ac: 11, subclassName: "School of Abjuration", equipment: ["a quarterstaff", "a spellbook"], spellSlots: [4, 2, 0, 0, 0, 0, 0, 0, 0] });
const sheetText = SV.withSyncComment_(fs.readFileSync(SAMPLE_SHEET, "utf8"), character);
const file = { path: "Aelen - Erin.md", basename: "Aelen - Erin", extension: "md" };
const fm = {};
const app = {
	vault: { read: async () => sheetText, cachedRead: async () => sheetText, getAbstractFileByPath: () => file, on: () => ({}) },
	metadataCache: { getFileCache: () => ({ frontmatter: fm }) },
	fileManager: { processFrontMatter: async (f, fn) => { await fn(fm); } },
	workspace: { getActiveFile: () => file, getLeaf() { return { openFile() {} }; } },
};
const events = [];
const plugin = { settings: { sheetPath: file.path }, lastActiveFile: file, logEvent: (e, d) => events.push(e + (d ? ":" + d : "")) };
const view = new View({ app }, plugin);

const row = () => { const sh = SV.getCharactersSheet_(); const H = SV.CHARACTERS_HEADERS; for (let r = 2; r <= sh.getLastRow(); r++) if (sh.cell(r, 1) === character.id) return Object.fromEntries(H.map((h, i) => [h, sh.cell(r, i + 1)])); };
const setCell = (header, v) => { const sh = SV.getCharactersSheet_(); const H = SV.CHARACTERS_HEADERS; for (let r = 2; r <= sh.getLastRow(); r++) if (sh.cell(r, 1) === character.id) sh.set(r, H.indexOf(header) + 1, v); };
const text = () => view.contentEl.textContent;
const buttons = () => [...view.contentEl.querySelectorAll("button")].map((b) => b.textContent);
const click = (label) => { const b = [...view.contentEl.querySelectorAll("button")].find((x) => x.textContent === label); assert(b, "no button " + label); b.dispatchEvent(new window.Event("click")); };
const lastNotice = () => notices[notices.length - 1];
const tick = () => new Promise((r) => setTimeout(r, 15));
let n = 0; const ok = async (name, fn) => { await fn(); n++; console.log("  ok  " + name); };

(async () => {
	// ---- pure mapping layer
	await ok("sync comment parses; junk, wrong version and non-https are refused", () => {
		const i = C.parseSyncInfo(sheetText); assert(i && i.id === character.id && i.token === character.token && i.endpoint.startsWith("https://"));
		assert.strictEqual(C.parseSyncInfo("<!-- kadria-sync {not json} -->"), null);
		assert.strictEqual(C.parseSyncInfo('<!-- kadria-sync {"v":2,"endpoint":"https://x","id":"a","token":"b"} -->'), null);
		assert.strictEqual(C.parseSyncInfo('<!-- kadria-sync {"v":1,"endpoint":"http://x","id":"a","token":"b"} -->'), null);
		assert.strictEqual(C.parseSyncInfo("no comment here"), null);
	});
	await ok("inventory text round-trips ('rope x2', plain names, zero-quantity dropped)", () => {
		const items = [{ name: "rope", qty: 2 }, { name: "a torch", qty: 1 }, { name: "gone", qty: 0 }];
		assert.strictEqual(C.inventoryToText(items), "rope x2\na torch");
		assert.deepStrictEqual(C.textToInventory("rope x2\n\na torch"), [{ name: "rope", qty: 2 }, { name: "a torch", qty: 1 }]);
	});
	await ok("push fields are clamped, rounded and shaped the way the server validates", () => {
		const f = C.buildPushFields({ hp: -4, hp_max: 20.4, ac: "15", gold: 12.345, inventory: [{ name: "x", qty: 3 }], spell_slots: { 1: { used: 9, max: 4 }, 2: { used: 1, max: 0 }, 12: { used: 0, max: 1 } } });
		assert.deepStrictEqual(J(f), { hp: 0, hpMax: 20, ac: 15, gold: 12.35, inventory: "x x3", spellSlots: '{"1":{"used":4,"max":4}}' });
	});

	// ---- the view against the real server logic
	await ok("opening a linked sheet shows the sync bar, pulls once, and is not dirty", async () => {
		await view.onOpen(); await tick();
		assert(buttons().includes("Send to sheet") && buttons().includes("Get from sheet"));
		assert(text().includes("Not synced yet") || text().includes("Linked to the sheet"), text());
		assert(fm.sync_last_pull_at && !fm.sync_dirty);
		assert(events.some((e) => e.startsWith("sync_pull_ok:auto")));
		assert.strictEqual(fm.hp_max > 0, true);
	});
	await ok("a widget edit marks the character as having unsent changes, and the body re-parse can't undo it", async () => {
		await view.updateFrontmatter((f) => { f.hp = 3; });
		assert.strictEqual(fm.sync_dirty, true); assert(text().includes("Unsent changes"));
		await view.syncFrontmatterFromBody(false); // what happens every time the panel is reopened
		assert.strictEqual(fm.hp, 3, "unsent HP must survive the open-time re-parse");
	});
	await ok("manual Get with unsent changes tells the player and leaves their values alone", async () => {
		await view.syncGet({ auto: false });
		assert(/unsent changes/i.test(lastNotice()), lastNotice()); assert.strictEqual(fm.hp, 3);
	});
	await ok("Send writes ONLY the player-owned fields to the sheet and clears the flag", async () => {
		await view.updateFrontmatter((f) => { f.gold = 25; f.inventory = [{ name: "rope", qty: 2 }, { name: "a torch", qty: 1 }]; });
		await view.syncSend();
		const r = row();
		assert.deepStrictEqual([r["HP"], r["Gold"], r["Inventory"]], [3, 25, "rope x2\na torch"]);
		assert.deepStrictEqual(J(JSON.parse(r["Spell Slots"])), J(C.normSlots(fm.spell_slots)));
		assert.strictEqual(r["Level"], 3); assert.strictEqual(r["Party"], ""); // untouched
		assert.strictEqual(fm.sync_dirty, false); assert(fm.sync_last_push_at); assert(lastNotice() === "Sent to the sheet.", lastNotice());
	});
	await ok("when clean, the sheet wins: a body re-parse resets HP, the next auto-pull restores it", async () => {
		await view.syncFrontmatterFromBody(false);
		assert.notStrictEqual(fm.hp, 3, "the open-time re-parse resets HP from the printed sheet (existing behaviour)");
		view._autoPulledFor = null; view.autoPullIfNeeded(); await tick(); await tick();
		assert.strictEqual(fm.hp, 3); assert.strictEqual(fm.gold, 25);
		assert.deepStrictEqual(J(fm.inventory), [{ name: "rope", qty: 2 }, { name: "a torch", qty: 1 }]);
	});
	await ok("a DM draft is invisible to the player until published", async () => {
		setCell("Party", "Blue"); setCell("Conditions", "poisoned, prone"); setCell("DM Notes", "The guild wants a word.");
		await view.syncGet({ auto: false });
		assert(!fm.party && !fm.dm_notes && !(fm.conditions || []).includes("poisoned"), "draft must not reach the player");
	});
	await ok("after Publish the player gets party, conditions and DM notes (and is told)", async () => {
		env.ui.answer = "YES"; SV.publishDmChanges();
		await view.syncGet({ auto: false });
		assert.strictEqual(fm.party, "Blue"); assert.strictEqual(fm.dm_notes, "The guild wants a word."); assert.deepStrictEqual(J(fm.conditions), ["poisoned", "prone"]);
		assert(notices.some((m) => /Your DM updated: party, notes, conditions/.test(m)), notices.join(" | "));
		view.render(); await tick(); assert(text().includes("Party: Blue"));
	});
	await ok("a DM edit published again only changes what changed; an unchanged version is left alone", async () => {
		fm.conditions = ["prone"]; // the player toggles a condition locally
		await view.syncGet({ auto: false }); assert.deepStrictEqual(J(fm.conditions), ["prone"], "same published version must not overwrite local toggles");
		setCell("Conditions", "poisoned"); env.ui.answer = "YES"; SV.publishDmChanges(); await view.syncGet({ auto: false });
		assert.deepStrictEqual(J(fm.conditions), ["poisoned"]);
	});
	await ok("a published gold award is pending, never added automatically, and the reminder wording is shown", async () => {
		SV.getAwardsSheet_().appendRow(["", "", "Aelen", "Erin", 100, "session 1", "", ""]); env.ui.answer = "YES"; SV.publishDmChanges();
		const goldBefore = fm.gold; await view.syncGet({ auto: false });
		assert.strictEqual(fm.gold, goldBefore, "the sheet must not add gold for the player");
		assert.strictEqual(fm.sync_pending_awards.length, 1);
		assert(notices.some((m) => /Your DM awarded 100 gp\. The sheet doesn't add it for you/.test(m)));
		view.pageIndex = view.pages.findIndex((p) => p.title.includes("Inventory")); await view.render(); await tick();
		assert(text().includes("+100 gp — session 1") && text().includes("doesn't add it for you"), text().slice(0, 300));
	});
	await ok("'Add to my gold' adds it, marks the player as having unsent changes, and Send puts it on the sheet", async () => {
		click("Add to my gold"); await tick(); await tick();
		assert.strictEqual(fm.gold, 125); assert.strictEqual(fm.sync_pending_awards.length, 0); assert.strictEqual(fm.sync_dirty, true);
		await view.syncSend(); assert.strictEqual(row()["Gold"], 125);
		await view.syncGet({ auto: false }); assert.strictEqual(fm.sync_pending_awards.length, 0, "a resolved award does not come back");
	});
	await ok("offline: Send fails kindly, nothing is lost, the flag stays", async () => {
		await view.updateFrontmatter((f) => { f.hp = 11; }); netDown = true;
		await view.syncSend(); assert(/Couldn't reach the sheet/.test(lastNotice())); assert.strictEqual(fm.hp, 11); assert.strictEqual(fm.sync_dirty, true);
		await view.syncGet({ auto: true }); // an automatic pull offline is silent
		const n0 = notices.length; await view.syncGet({ auto: true }); assert.strictEqual(notices.length, n0); netDown = false;
	});
	await ok("Restore discards unsent changes only after confirmation", async () => {
		await view.syncRestore(); const m = Modal.last; assert(m && m.contentEl.textContent.includes("Anything you haven't sent will be lost"));
		assert.strictEqual(fm.hp, 11, "nothing changes before the player confirms");
		[...m.contentEl.querySelectorAll("button")].find((b) => b.textContent === "Restore").dispatchEvent(new window.Event("click")); await tick(); await tick();
		assert.strictEqual(fm.hp, 3); assert.strictEqual(fm.sync_dirty, false);
	});
	await ok("a sheet with no link shows no sync bar and the commands explain why", async () => {
		const v2 = new View({ app: Object.assign({}, app, { vault: Object.assign({}, app.vault, { cachedRead: async () => "# plain", read: async () => "# plain" }) }) }, plugin);
		await v2.render(); assert(!v2.contentEl.textContent.includes("Send to sheet"));
		await v2.syncSend(); assert(/no sheet link/i.test(lastNotice()));
	});
	await ok("a refused token (e.g. the character was wiped) gets a clear message and changes nothing", async () => {
		const sh = SV.getCharactersSheet_(); sh.data.splice(1, sh.getLastRow() - 1); const before = fm.hp;
		await view.syncSend(); assert(/did not accept this character link/.test(lastNotice())); assert.strictEqual(fm.hp, before);
	});
	console.log("\n" + n + " checks passed");
})().catch((e) => { console.error(e); process.exit(1); });
