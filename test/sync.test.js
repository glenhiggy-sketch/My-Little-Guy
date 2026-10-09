// End-to-end test of My Little Guy's sheet sync WITHOUT a device or a network (see harness.js).
// Run: node test/sync.test.js
"use strict";
const assert = require("assert");
const { makeHarness, J } = require("./harness");

const H = makeHarness();
const { C, SV, env, view, fm, notices, window, sheetText, app, plugin, View } = H;
const row = H.sheetRow, setCell = H.setCell, tick = H.tick;
const text = () => view.contentEl.textContent;
const buttons = () => [...view.contentEl.querySelectorAll("button")].map((b) => b.textContent);
const click = (label) => { const b = [...view.contentEl.querySelectorAll("button")].find((x) => x.textContent === label); assert(b, "no button " + label); b.dispatchEvent(new window.Event("click")); };
const lastNotice = () => notices[notices.length - 1];
let n = 0; const ok = async (name, fn) => { await fn(); n++; console.log("  ok  " + name); };
const Modal = { get last() { return H.modal; } };

(async () => {
	// ---- pure mapping layer
	await ok("sync comment parses; junk, wrong version and non-https are refused", () => {
		const i = C.parseSyncInfo(sheetText); assert(i && i.id === H.row.id && i.token === H.row.token && i.endpoint.startsWith("https://"));
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
		assert(H.events.some((e) => e.startsWith("sync_pull_ok:auto")));
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
	await ok("once synced, reopening keeps the last sent values (the printed sheet no longer puts old numbers back) and the pull still agrees", async () => {
		await view.syncFrontmatterFromBody(false);
		assert.strictEqual(fm.hp, 3, "a re-parse on open must not revert HP to the printed sheet once it has synced");
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
		await view.updateFrontmatter((f) => { f.hp = 11; }); H.netDown = true;
		await view.syncSend(); assert(/Couldn't reach the sheet/.test(lastNotice())); assert.strictEqual(fm.hp, 11); assert.strictEqual(fm.sync_dirty, true);
		await view.syncGet({ auto: true }); // an automatic pull offline is silent
		const n0 = notices.length; await view.syncGet({ auto: true }); assert.strictEqual(notices.length, n0); H.netDown = false;
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
	await ok("every class gets its limited-use trackers at level 9 (and none for a class without any)", () => {
		const ab = (o) => ({ cha: { score: 16 }, int: { score: 16 }, ...o });
		const names = (cls, extra) => C.classTrackers({ class: cls, level: 9, abilities: ab({}), ...extra }).map((t) => t.name + ":" + t.max + ":" + t.recovery);
		assert.deepStrictEqual(names("Barbarian"), ["Rage:4:long"]);
		assert.deepStrictEqual(names("Bard"), ["Bardic Inspiration:3:short"]);
		assert.deepStrictEqual(names("Cleric"), ["Channel Divinity:3:long"]);
		assert.deepStrictEqual(names("Druid"), ["Wild Shape:3:long"]);
		assert.deepStrictEqual(names("Fighter"), ["Second Wind:3:long", "Action Surge:1:short", "Indomitable:1:long"]);
		assert.strictEqual(names("Fighter", { subclass: "Battle Master" }).pop(), "Superiority Dice:5:short");
		assert.deepStrictEqual(names("Monk"), ["Focus Points:9:short", "Uncanny Metabolism:1:long"]);
		assert.deepStrictEqual(names("Paladin"), ["Lay on Hands (HP pool):45:long", "Channel Divinity:2:long"]);
		assert.deepStrictEqual(names("Ranger"), ["Favored Enemy (free Hunter's Mark):4:long"]);
		assert.deepStrictEqual(names("Rogue"), []);
		assert.deepStrictEqual(names("Sorcerer"), ["Sorcery Points:9:long", "Innate Sorcery:2:long", "Sorcerous Restoration:1:long"]);
		assert.deepStrictEqual(names("Warlock"), ["Magical Cunning:1:long"]);
		assert.deepStrictEqual(names("Wizard"), ["Arcane Recovery:1:long"]);
		assert.deepStrictEqual(names("Artificer"), ["Magical Tinkering:3:long", "Flash of Genius:3:long"]);
		assert.deepStrictEqual(C.classTrackers({ class: "Barbarian", level: 1 }).map((t) => t.max), [2], "level 1 barbarian");
		assert.deepStrictEqual(C.classTrackers({ class: "Fighter and a half", level: 5 }), [], "an unknown class gets nothing");
	});
	await ok("a first-time character gets its trackers, and re-reading the printed sheet never wipes the used counts", async () => {
		assert.deepStrictEqual(fm.features.map((f) => f.name), ["Arcane Recovery"]);
		await view.updateFrontmatter((f) => { f.features[0].used = 1; });
		await view.syncFrontmatterFromBody(false);
		assert.strictEqual(fm.features[0].used, 1, "used count survives a re-read");
		await view.updateFrontmatter((f) => { f.features = []; }); await view.syncFrontmatterFromBody(false);
		assert.deepStrictEqual(fm.features, [], "a player who removed them does not get them back");
	});
	console.log("\n" + n + " checks passed");
})().catch((e) => { console.error(e); process.exit(1); });
