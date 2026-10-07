// Shared test rig: the plugin's REAL view code rendered into jsdom, talking (through an injected requestUrl) to the
// REAL Apps Script server logic (test/vendor/appscript) running on in-memory fakes of Sheets/Drive.
// Used by test/sync.test.js and by the sim/ "dom" device. Each makeHarness() call is a fresh world: new vault file,
// new Sheet, new character -- nothing is shared between runs.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const SERVER = path.join(__dirname, "vendor", "appscript");
const FIXTURE = path.join(__dirname, "fixtures", "sample-character.md");
const J = (x) => JSON.parse(JSON.stringify(x));

function makeHarness(opts) {
	opts = opts || {};
	const character = opts.character || { name: "Aelen", player: "Erin", species: "Tortle", background: "Sage", className: "Wizard", alignment: "Neutral Good" };

	// ---- server: the real Apps Script logic on fakes
	const env = require(path.join(SERVER, "test_fakes.js")).makeEnv();
	vm.runInContext(fs.readFileSync(path.join(SERVER, "Sync.js"), "utf8"), env.ctx);
	vm.runInContext(fs.readFileSync(path.join(SERVER, "Publish.js"), "utf8"), env.ctx);
	const SV = vm.runInContext("({upsertDatabaseRow_, pullCharacter_, doPost, publishDmChanges, withSyncComment_, getCharactersSheet_, getAwardsSheet_, getPublishedSheet_, CHARACTERS_HEADERS})", env.ctx);

	// ---- DOM + obsidian stubs
	const window = new JSDOM("<!doctype html><body></body>").window;
	const P = window.HTMLElement.prototype;
	P.createEl = function (tag, o) {
		o = o || {}; const e = this.ownerDocument.createElement(tag);
		if (o.cls) e.className = [].concat(o.cls).join(" ");
		if (o.text !== undefined) e.textContent = o.text;
		if (o.type) e.type = o.type; if (o.placeholder) e.placeholder = o.placeholder; if (o.title) e.title = o.title;
		if (o.attr) Object.keys(o.attr).forEach((k) => e.setAttribute(k, o.attr[k]));
		this.appendChild(e); return e;
	};
	P.createDiv = function (o) { return this.createEl("div", o); };
	P.createSpan = function (o) { return this.createEl("span", o); };
	P.empty = function () { this.textContent = ""; };
	P.addClass = function (c) { this.classList.add(c); };
	P.removeClass = function (c) { this.classList.remove(c); };
	P.toggleClass = function (c, on) { this.classList.toggle(c, on === undefined ? undefined : !!on); };
	P.setAttr = function (k, v) { this.setAttribute(k, v); };
	P.setText = function (s) { this.textContent = s; };
	P.createSvg = function (tag, o) { return this.createEl(tag, o); };

	const getCache = {};
	const h = { cacheSnapshot: {}, notices: [], netDown: false, events: [], window, env, SV, J, modal: null };
	const obsidian = {
		parseYaml: (t) => JSON.parse(t), Plugin: class {}, PluginSettingTab: class {}, Setting: class {}, MarkdownView: class {}, MarkdownRenderer: { render: async (_app, md, el) => { el.textContent = md; } }, addIcon() {},
		Platform: { isMobile: false, isIosApp: false },
		Notice: class { constructor(m) { h.notices.push(String(m)); } },
		ItemView: class { constructor(leaf) { this.leaf = leaf; this.app = leaf.app; this.contentEl = window.document.createElement("div"); } registerEvent() {} },
		Modal: class { constructor(app) { this.app = app; this.contentEl = window.document.createElement("div"); } open() { h.modal = this; this.onOpen(); } close() { this.onClose && this.onClose(); h.modal = null; } },
		// routes the plugin's HTTP calls to the server logic, like Apps Script's redirecting web app would
		requestUrl: async ({ url, method, body }) => {
			if (opts.hangFirstRequest && !h.hung) { h.hung = true; return new Promise(() => {}); } // stalls forever, like a request right after app launch
			if (h.netDown) throw new Error("net::ERR_INTERNET_DISCONNECTED");
			if (opts.cacheGets && method !== "POST" && getCache[url]) return getCache[url]; // an HTTP cache answering an identical GET
			const u = new URL(url);
			const res = method === "POST" ? SV.doPost({ postData: { contents: body } }) : u.searchParams.get("action") === "pull" ? SV.pullCharacter_(Object.fromEntries(u.searchParams)) : { ok: false, error: "unknown" };
			const text = JSON.stringify(J(res));
			const out = { status: 200, text, get json() { return JSON.parse(text); } };
			if (opts.cacheGets && method !== "POST") getCache[url] = out;
			return out;
		},
	};
	const mod = { exports: {} };
	global.window = window; global.document = window.document;
	new Function("module", "exports", "require", fs.readFileSync(path.join(ROOT, "main.js"), "utf8"))(mod, mod.exports, (n) => (n === "obsidian" ? obsidian : require(n)));
	const { __sync: C, __CharacterHubView: View } = mod.exports;

	// ---- a character, a vault file and a fake app around it
	const row = SV.upsertDatabaseRow_({ characterName: character.name, playerName: character.player, species: character.species, background: character.background, className: character.className, alignment: character.alignment },
		{ level: 3, hp: 20, ac: 11, subclassName: "School of Abjuration", equipment: ["a quarterstaff", "a spellbook"], spellSlots: [4, 2, 0, 0, 0, 0, 0, 0, 0] });
	const sheetText = SV.withSyncComment_(fs.readFileSync(opts.fixture || FIXTURE, "utf8"), row);
	const file = { path: character.name + " - " + character.player + ".md", basename: character.name + " - " + character.player, extension: "md" };
	const fm = {};
	const app = {
		// staleCache: the note on disk carries the real saved values (as YAML front matter; JSON is valid YAML) while Obsidian's cache lags
		vault: { read: async () => (opts.staleCache ? "---\n" + JSON.stringify(fm) + "\n---\n" + sheetText : sheetText), cachedRead: async () => (opts.staleCache ? "---\n" + JSON.stringify(fm) + "\n---\n" + sheetText : sheetText), getAbstractFileByPath: () => file, on: () => ({}) },
		// staleCache: like iOS, the metadata cache does not reflect our own writes until much later (here: never)
		metadataCache: { getFileCache: () => ({ frontmatter: opts.staleCache ? h.cacheSnapshot : fm }) },
		fileManager: { processFrontMatter: async (f, fn) => { await fn(fm); } },
		workspace: { getActiveFile: () => (h.noteOpen ? file : null), getLeaf() { return { openFile() {} }; } },
	};
	h.noteOpen = !opts.panelFirst; // panelFirst: the panel is open (as after a fresh install) before the player opens their character note
	h.netDown = !!opts.startOffline;
	const plugin = { syncRetryMs: 20, syncTimeoutMs: 100, settings: { sheetPath: opts.panelFirst ? "" : file.path }, lastActiveFile: opts.panelFirst ? null : file, logEvent: (e, d) => h.events.push(e + (d ? ":" + d : "")) };
	const view = new View({ app }, plugin);

	// ---- sheet-side helpers (what a DM sees in Google Sheets)
	const sheetRow = () => { const sh = SV.getCharactersSheet_(); const H = SV.CHARACTERS_HEADERS; for (let r = 2; r <= sh.getLastRow(); r++) if (sh.cell(r, 1) === row.id) return Object.fromEntries(H.map((x, i) => [x, sh.cell(r, i + 1)])); };
	const setCell = (header, v) => { const sh = SV.getCharactersSheet_(); const H = SV.CHARACTERS_HEADERS; for (let r = 2; r <= sh.getLastRow(); r++) if (sh.cell(r, 1) === row.id) sh.set(r, H.indexOf(header) + 1, v); };
	return Object.assign(h, { C, View, row, character, sheetText, file, fm, app, plugin, view, sheetRow, setCell, tick: () => new Promise((r) => setTimeout(r, 15)) });
}

module.exports = { makeHarness, J };
