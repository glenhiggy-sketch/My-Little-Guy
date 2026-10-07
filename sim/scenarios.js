// The end-user scenarios. Written ONLY against the Device interface (tap / type / read the screen) and the World
// (what the DM sees and does in the Sheet) -- never against plugin internals -- so the same script runs on the jsdom
// device in CI and on the real iPhone. Every scenario starts from a brand-new character (the runner builds the world).
//
// REGRESSION POLICY: when a bug is found (by anyone, on any device), add a scenario named after it below and list it
// in sim/BUGS.md. A fixed bug is only "fixed" once its scenario passes on every device that can run it.
"use strict";
const assert = require("assert");

const has = (text, s) => assert(text.includes(s), `expected the screen to show "${s}". Screen: ${text.slice(0, 300)}`);
const lacks = (text, s) => assert(!text.includes(s), `the screen should not show "${s}"`);
const slots = (row) => JSON.parse(row.spellSlots);

module.exports = [
	{
		name: "open-and-orient",
		story: "I open my character for the first time: I see my HP, AC and the sync bar, and my values match what character building gave me.",
		async run({ device, world, step }) {
			await device.open();
			await step("the header shows HP, AC and the sync buttons", async () => {
				const t = await device.text(); has(t, "Send to sheet"); has(t, "Get from sheet");
				const row = await world.sheetRow();
				assert.strictEqual(Number(await device.value("HP")), Number(row.hpMax), "HP should start at the sheet's max");
				assert.strictEqual(Number(await device.value("AC")), Number(row.ac));
			});
			await step("nothing is flagged as unsent yet", async () => lacks(await device.text(), "Unsent changes"));
		},
	},
	{
		name: "note-opened-while-panel-open",
		story: "I install the plugin (the panel opens by itself), then open my character note: the panel must show my character, not a blank one.",
		needs: ["fake-world", "panel-first"], // needs the panel open before any note (driver gap on the phone)
		world: { panelFirst: true },
		async run({ device, world, step }) {
			await device.open();
			await step("with no note open the panel says so", async () => has(await device.text(), "No character sheet selected"));
			await step("opening my note fills the panel with my character", async () => {
				await device.openNote();
				const t = await device.text(); lacks(t, "Class ?"); has(t, "Wizard");
				assert.strictEqual(Number(await device.value("HP")), Number((await world.sheetRow()).hpMax), "HP should be my character's max, not 0");
			});
		},
	},
	{
		name: "first-pull-survives-a-network-blip",
		story: "I open the app right after launching it and the phone's network isn't ready for a moment: the sheet link must still sync by itself a few seconds later.",
		needs: ["fake-world"], // regression scenario for a condition only the fake world can create (a lagging cache, a stalled or offline network)
		world: { startOffline: true },
		async run({ device, step }) {
			await device.open();
			await step("with no network the panel still shows my character (nothing lost)", async () => has(await device.text(), "Not synced yet"));
			await device.setOffline(false);
			await step("a few seconds later it links to the sheet on its own", async () => device.waitForText("Linked to the sheet", 20000));
		},
	},
	{
		name: "first-pull-survives-a-stalled-request",
		story: "Right after the app launches the first request to the sheet never answers: it must time out and retry on its own, not leave me 'Not synced yet'.",
		needs: ["fake-world"], // regression scenario for a condition only the fake world can create (a lagging cache, a stalled or offline network)
		world: { hangFirstRequest: true },
		async run({ device, step }) {
			await device.open();
			await step("it links to the sheet by itself without me touching anything", async () => device.waitForText("Linked to the sheet", 20000));
		},
	},
	{
		name: "screen-keeps-up-when-obsidians-cache-lags",
		story: "Obsidian on the phone updates its note index slowly: what I just typed, and the sheet link status, must still show straight away.",
		needs: ["fake-world"], // regression scenario for a condition only the fake world can create (a lagging cache, a stalled or offline network)
		world: { staleCache: true },
		async run({ device, step }) {
			await device.open();
			await step("the first automatic sync shows as linked even though the index has not caught up", async () => device.waitForText("Linked to the sheet", 20000));
			await step("an HP change shows immediately as an unsent change", async () => {
				await device.type("HP", 7); has(await device.text(), "Unsent changes"); assert.strictEqual(Number(await device.value("HP")), 7);
			});
		},
	},
	{
		name: "dm-update-is-not-hidden-by-a-cached-answer",
		story: "I press Get from sheet, then my DM publishes, then I press it again: a cached copy of the earlier answer must not hide the update.",
		world: { cacheGets: true },
		needs: ["fake-world"], // the phone's own HTTP cache is the real-world version of this
		async run({ device, world, step }) {
			await device.open();
			await step("nothing published yet", async () => { await device.tap("Get from sheet"); lacks(await device.text(), "Party: Blue"); });
			await step("after Publish, the very same button shows the party", async () => {
				await world.dm.draft({ party: "Blue" }); await world.dm.publish(); await device.tap("Get from sheet");
				has(await device.text(), "Party: Blue");
			});
		},
	},
	{
		name: "play-a-fight",
		story: "I get hit, change my HP, see it's unsent, press Send, and the DM's sheet shows my HP.",
		async run({ device, world, step }) {
			await device.open();
			await step("changing HP shows 'Unsent changes'", async () => { await device.type("HP", 7); has(await device.text(), "Unsent changes"); });
			await step("the sheet still has the old HP before I send", async () => assert.notStrictEqual((await world.sheetRow()).hp, 7));
			await step("Send puts HP on the sheet and clears the warning", async () => {
				await device.tap("Send to sheet");
				assert.strictEqual((await world.sheetRow()).hp, 7); lacks(await device.text(), "Unsent changes");
			});
		},
	},
	{
		name: "inventory-and-gold",
		story: "I loot a body: add gold, add an item, send. The sheet has both.",
		async run({ device, world, step }) {
			await device.open(); await device.goToPage("Inventory");
			await step("set gold and add a named item", async () => {
				await device.type("Gold", 40); await device.tap("+ Add item"); await device.type("Item name", "rope", { nth: "last" });
			});
			await step("Send puts gold and the item on the sheet", async () => {
				await device.tap("Send to sheet"); const row = await world.sheetRow();
				assert.strictEqual(row.gold, 40); assert(String(row.inventory).toLowerCase().includes("rope"), "inventory: " + row.inventory); // iOS capitalises the first letter
			});
		},
	},
	{
		name: "spell-slots",
		story: "I cast a spell: tap a level-1 slot, send, the sheet shows one used.",
		async run({ device, world, step }) {
			await device.open(); await device.goToPage("Spells");
			await step("tapping a slot marks it used", async () => { await device.tap("Level 1 slot 1"); has(await device.text(), "Unsent changes"); });
			await step("Send puts the used slot on the sheet", async () => { await device.tap("Send to sheet"); assert.strictEqual(slots(await world.sheetRow())["1"].used, 1); });
		},
	},
	{
		name: "long-rest",
		story: "After a fight and a long rest I'm back to full HP and my slots reset.",
		async run({ device, world, step }) {
			await device.open();
			await device.type("HP", 3); await device.goToPage("Spells"); await device.tap("Level 1 slot 1");
			await step("a long rest restores HP", async () => {
				await device.tap("🌙 Long");
				assert.strictEqual(Number(await device.value("HP")), Number((await world.sheetRow()).hpMax));
			});
			await step("sending after the rest puts full HP and fresh slots on the sheet", async () => {
				await device.tap("Send to sheet"); const row = await world.sheetRow();
				assert.strictEqual(row.hp, row.hpMax); assert.strictEqual(slots(row)["1"].used, 0);
			});
		},
	},
	{
		name: "dm-updates-me",
		story: "My DM puts me in a party and adds a note. I see nothing until they publish, then Get from sheet shows it.",
		async run({ device, world, step }) {
			await device.open();
			await step("a DM draft is invisible to me", async () => { await world.dm.draft({ party: "Blue", notes: "The guild wants a word." }); await device.tap("Get from sheet"); lacks(await device.text(), "Party: Blue"); });
			await step("after Publish, Get from sheet shows the party and tells me", async () => {
				await world.dm.publish(); await device.tap("Get from sheet");
				has(await device.text(), "Party: Blue"); assert((await device.notices()).some((m) => /Your DM updated/.test(m)), (await device.notices()).join(" | "));
			});
		},
	},
	{
		name: "gold-award-is-never-automatic",
		story: "My DM awards 100 gp. My sheet does NOT add it; I choose, then Send.",
		async run({ device, world, step }) {
			await device.open(); await device.goToPage("Inventory");
			const before = Number(await device.value("Gold"));
			await step("the award shows as pending with the 'update it yourself' wording; gold is unchanged", async () => {
				await world.dm.award(100, "session 1"); await world.dm.publish(); await device.tap("Get from sheet");
				await device.goToPage("Inventory"); has(await device.text(), "+100 gp"); has(await device.text(), "doesn't add it for you");
				assert.strictEqual(Number(await device.value("Gold")), before);
			});
			await step("Add to my gold adds it, and Send puts it on the sheet", async () => {
				await device.tap("Add to my gold"); assert.strictEqual(Number(await device.value("Gold")), before + 100);
				await device.tap("Send to sheet"); assert.strictEqual((await world.sheetRow()).gold, before + 100);
			});
			await step("a resolved award does not come back", async () => { await device.tap("Get from sheet"); await device.goToPage("Inventory"); lacks(await device.text(), "+100 gp"); });
		},
	},
	{
		name: "reopen-keeps-unsent-changes",
		story: "I change HP, close the app without sending, reopen it: my change is still there and still flagged.",
		async run({ device, step }) {
			await device.open(); await device.type("HP", 4);
			await step("after an app restart the HP is still mine and still unsent", async () => {
				await device.reopen(); assert.strictEqual(Number(await device.value("HP")), 4); has(await device.text(), "Unsent changes");
			});
		},
	},
	{
		name: "reopen-after-send",
		story: "I send, close the app, reopen it: I still see what I sent (no value silently resets).",
		async run({ device, world, step }) {
			await device.open(); await device.type("HP", 9); await device.type("AC", 16); await device.tap("Send to sheet");
			await step("after an app restart HP and AC are what I sent", async () => {
				await device.reopen();
				assert.strictEqual(Number(await device.value("HP")), 9); assert.strictEqual(Number(await device.value("AC")), 16);
				assert.strictEqual((await world.sheetRow()).hp, 9);
			});
		},
	},
	{
		name: "reopen-offline-keeps-what-i-sent",
		story: "I send my HP, close the app, and reopen it somewhere with no signal: my HP must still be what I sent, not the number on the printed sheet.",
		needs: ["offline"],
		async run({ device, step }) {
			await device.open(); await device.type("HP", 9); await device.tap("Send to sheet");
			await device.setOffline(true);
			await step("after a restart with no signal the HP is still what I sent", async () => {
				await device.reopen(); assert.strictEqual(Number(await device.value("HP")), 9);
			});
		},
	},
	{
		name: "restore-asks-first",
		story: "I mess up and run Restore from sheet: it warns me, and only on Restore are my unsent changes replaced.",
		needs: ["commands"],
		async run({ device, step }) {
			await device.open(); await device.type("HP", 10); await device.tap("Send to sheet"); // the sheet needs saved values to restore
			const start = 10;
			await device.type("HP", 2);
			await step("the warning appears and nothing changes yet", async () => {
				await device.runCommand("Restore from sheet (discard unsent changes)");
				await device.waitForText("Anything you haven't sent will be lost", 90000); // it asks the sheet first, which can take a while
				await device.tap("Cancel"); assert.strictEqual(Number(await device.value("HP")), 2);
			});
			await step("confirming puts the sheet's values back", async () => {
				await device.runCommand("Restore from sheet (discard unsent changes)");
				await device.waitForText("Anything you haven't sent will be lost", 90000); await device.tap("Restore");
				assert.strictEqual(Number(await device.value("HP")), start); lacks(await device.text(), "Unsent changes");
			});
		},
	},
	{
		name: "offline-send",
		story: "I'm in a dungeon with no signal: Send fails kindly and I lose nothing; later it works.",
		needs: ["offline"],
		async run({ device, world, step }) {
			await device.open(); await device.type("HP", 11); await device.setOffline(true);
			await step("Send tells me it couldn't reach the sheet and keeps my change", async () => {
				await device.tap("Send to sheet");
				assert((await device.notices()).some((m) => /Couldn't reach the sheet/.test(m))); assert.strictEqual(Number(await device.value("HP")), 11); has(await device.text(), "Unsent changes");
			});
			await device.setOffline(false);
			await step("back online, Send works", async () => { await device.tap("Send to sheet"); assert.strictEqual((await world.sheetRow()).hp, 11); });
		},
	},
];
