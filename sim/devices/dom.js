// "Device" backed by jsdom: the plugin's real view code, driven only through what a player can do --
// tap a button by its label, type into a field by its label, read the screen text. Fresh world per instance.
"use strict";
const { makeHarness } = require("../../test/harness");

const COMMANDS = {
	"Send to sheet": (v) => v.syncSend(),
	"Get from sheet": (v) => v.syncGet({ auto: false }),
	"Restore from sheet (discard unsent changes)": (v) => v.syncRestore(),
};

class DomDevice {
	constructor(h) { this.h = h; this.view = h.view; this.name = "dom"; this.capabilities = new Set(["offline", "commands"]); }
	root() { return this.h.modal ? this.h.modal.contentEl : this.view.contentEl; }
	async settle() { await this.h.tick(); await this.h.tick(); }
	async open() { await this.view.onOpen(); await this.settle(); }
	/** App restart: a brand-new view over the same vault file. */
	async reopen() { this.view = new this.h.View({ app: this.h.app }, this.h.plugin); await this.open(); }
	text() { return this.root().textContent.replace(/\s+/g, " "); }
	notices() { return this.h.notices.slice(); }
	fields(label) { return [...this.root().querySelectorAll("input, textarea")].filter((e) => e.getAttribute("aria-label") === label || e.placeholder === label); }
	button(label, nth = 0) {
		const els = [...this.root().querySelectorAll("button")].filter((e) => e.getAttribute("aria-label") === label || e.textContent.trim() === label);
		if (!els[nth]) throw new Error(`no button called "${label}"${nth ? " #" + nth : ""}. Screen: ${this.text().slice(0, 200)}`);
		return els[nth];
	}
	pick(label, o = {}) {
		const all = this.fields(label);
		const el = o.nth === "last" ? all[all.length - 1] : all[o.nth || 0];
		if (!el) throw new Error(`no field called "${label}". Screen: ${this.text().slice(0, 200)}`);
		return el;
	}
	async tap(label, o = {}) { this.button(label, o.nth || 0).dispatchEvent(new this.h.window.Event("click")); await this.settle(); }
	async type(label, value, o = {}) { const el = this.pick(label, o); el.value = String(value); el.dispatchEvent(new this.h.window.Event("change")); await this.settle(); }
	value(label, o = {}) { return this.pick(label, o).value; }
	async goToPage(fragment) {
		const dot = [...this.view.contentEl.querySelectorAll("button.csh-dot")].find((b) => (b.getAttribute("aria-label") || "").includes(fragment));
		if (!dot) throw new Error("no page called " + fragment);
		dot.dispatchEvent(new this.h.window.Event("click")); await this.settle();
	}
	async runCommand(name) { if (!COMMANDS[name]) throw new Error("unknown command " + name); await COMMANDS[name](this.view); await this.settle(); }
	/** The player opens their character note while the panel is already open (the plugin's active-leaf-change). */
	async openNote() { this.h.noteOpen = true; this.h.plugin.lastActiveFile = this.h.file; await this.view.render(); await this.settle(); }
	async waitForText(sub, ms) {
		const end = Date.now() + ms;
		while (Date.now() < end) { if (this.text().includes(sub)) return; await this.h.tick(); }
		throw new Error(`"${sub}" never appeared within ${ms / 1000}s. Screen: ${this.text().slice(0, 200)}`);
	}
	async setOffline(off) { this.h.netDown = !!off; }
	async screenshot() { return null; }
}

/** One fresh world: a new Sheet with a new character, a new vault file, a new device. */
function makeDomWorld(opts) {
	const h = makeHarness(opts);
	const world = {
		kind: "fake",
		character: { name: h.character.name, player: h.character.player },
		async sheetRow() {
			const r = h.sheetRow();
			return { hp: r["HP"], hpMax: r["HP Max"], ac: r["AC"], gold: r["Gold"], inventory: r["Inventory"], spellSlots: r["Spell Slots"], party: r["Party"], lastPushed: r["Last Pushed"] };
		},
		dm: {
			async draft(f) { const map = { party: "Party", conditions: "Conditions", notes: "DM Notes" }; Object.keys(f).forEach((k) => h.setCell(map[k], f[k])); },
			async award(amount, reason) { h.SV.getAwardsSheet_().appendRow(["", "", h.character.name, h.character.player, amount, reason || "", "", ""]); },
			async publish() { h.env.ui.answer = "YES"; h.SV.publishDmChanges(); },
		},
		async cleanup() {},
	};
	return { device: new DomDevice(h), world };
}

module.exports = { makeDomWorld, DomDevice };
