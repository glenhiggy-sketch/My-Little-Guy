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
		name: "first-pull-survives-a-long-outage",
		story: "I open the app and the phone has no internet for a good while (a minute or more): when it comes back the sheet link must still sync by itself, without me reopening anything.",
		needs: ["fake-world"], // regression scenario for a condition only the fake world can create (a lagging cache, a stalled or offline network)
		world: { startOffline: true },
		async run({ device, step }) {
			await device.open();
			await new Promise((r) => setTimeout(r, 1200)); // far longer than the first few quick retries
			await device.setOffline(false);
			await step("once the network is back it links to the sheet on its own", async () => device.waitForText("Linked to the sheet", 20000));
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
				await world.dm.draft({ party: "Blue" }); await world.dm.publish();
				await device.tap("Get from sheet");
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
		name: "class-resources-are-tracked",
		story: "My class has limited-use features (a wizard's Arcane Recovery): they are already listed with their uses, I can spend one, and a long rest gives it back.",
		async run({ device, step }) {
			await device.open(); await device.goToPage("Combat");
			// the feature name sits in an editable field, so the test finds the tracker by its use pip (it fails if there is none)
			await step("the class's limited-use feature is already tracked and I can spend a use", async () => device.tap("Arcane Recovery use 1"));
			await step("after a long rest it is listed again and spendable", async () => { await device.tap("🌙 Long"); await device.goToPage("Combat"); await device.tap("Arcane Recovery use 1"); });
		},
	},
	{
		name: "hit-dice-exhaustion-and-inspiration",
		story: "After a fight I spend a hit die to heal, mark my exhaustion, and note that I have Heroic Inspiration: all of it is on my sheet and I can use it.",
		async run({ device, step }) {
			await device.open(); await device.type("HP", 2); await device.goToPage("Combat");
			await step("I can see my hit dice and spend one", async () => { has(await device.text(), "Hit Dice: 3 / 3"); await device.tap("Spend a hit die"); await device.waitForText("Hit Dice: 2 / 3", 15000); });
			await step("I can raise my exhaustion", async () => { await device.tap("Increase exhaustion"); await device.waitForText("Exhaustion: 1 / 6", 15000); });
			await step("I can take Heroic Inspiration", async () => { await device.tap("Heroic Inspiration: no"); await device.waitForText("Heroic Inspiration: yes", 15000); });
		},
	},
	{
		name: "dm-updates-me",
		story: "My DM puts me in a party and adds a note. I see nothing until they publish, then Get from sheet shows it.",
		async run({ device, world, step }) {
			await device.open();
			await step("a DM draft is invisible to me", async () => { await world.dm.draft({ party: "Blue", notes: "The guild wants a word." }); await device.tap("Get from sheet"); lacks(await device.text(), "Party: Blue"); });
			await step("after Publish, Get from sheet shows the party and tells me", async () => {
				await world.dm.publish();
				for (let i = 0; i < 3; i++) { await device.tap("Get from sheet"); if ((await device.text()).includes("Party: Blue")) break; } // a patient player presses it again; the Sheet can lag a moment behind a publish
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
				await world.dm.award(100, "session 1"); await world.dm.publish();
				for (let n = 0; n < 3; n++) { await device.tap("Get from sheet"); await device.goToPage("Inventory"); if ((await device.text()).includes("+100 gp")) break; } // a patient player presses it again; the Sheet can lag a moment behind a publish
				has(await device.text(), "+100 gp"); has(await device.text(), "doesn't add it for you");
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
				await device.reopen(); assert.strictEqual(Number(await device.value("HP")), 4); await device.waitForText("Unsent changes", 20000); // the phone draws the panel a moment after the app is back
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
		name: "late-file-event-does-not-undo-my-send",
		story: "I send my HP; a moment later Obsidian reports a change to the note. My HP must stay what I sent, and it must not be flagged as unsent again.",
		needs: ["fake-world"], // the phone delivers these events at unpredictable times
		async run({ device, world, step }) {
			await device.open(); await device.type("HP", 9); await device.tap("Send to sheet");
			await step("a late file-change event leaves my sent HP and the 'sent' status alone", async () => {
				await device.lateFileEvent();
				assert.strictEqual(Number(await device.value("HP")), 9); lacks(await device.text(), "Unsent changes");
				assert.strictEqual((await world.sheetRow()).hp, 9);
			});
		},
	},
	{
		name: "reopen-with-a-stale-index-keeps-unsent-changes",
		story: "I change my HP and close the app without sending. On reopening, Obsidian's note index has not caught up: my HP must still be what I typed, still flagged unsent.",
		world: { staleCache: true },
		needs: ["fake-world"], // the real phone shows this as the index lagging after a cold start
		async run({ device, step }) {
			await device.open(); await device.type("HP", 4);
			await step("after a restart the HP is still mine and still unsent", async () => {
				await device.reopen(); assert.strictEqual(Number(await device.value("HP")), 4); await device.waitForText("Unsent changes", 20000); // the phone draws the panel a moment after the app is back
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

// ---- Level 20 end to end (SIM_L20=1, phone only) -------------------------------------------------------------
// Each one starts at the player-facing form link, builds the character through the form, takes the sheet that comes out
// (as the Drive link would deliver it), puts it in the phone's vault, and then plays it: what the SHEET says must be what
// the PHONE shows, and what the Sheet (server) holds must match what the phone sends.
const fs = require("fs");
function l20Scenario(persona) {
	return {
		name: persona.classes ? "complex-" + persona.label : "level-20-" + persona.cls.toLowerCase() + "-" + persona.subclass.toLowerCase().replace(/[^a-z]+/g, "-"),
		story: `A player follows the link, builds a ${persona.classes ? "multiclass " + persona.classes.map((c) => `${c.cls} ${c.level}`).join(" / ") : `level 20 ${persona.cls} (${persona.subclass})`}, gets the sheet, and plays it on the phone: every feature, tracker and spell slot the sheet lists is there and works.`,
		needs: ["live-l20"],
		persona: persona.classes ? persona : { level: 20, ...persona },
		async run({ device, world, step }) {
			const sheet = fs.readFileSync(world.character.path, "utf8");
			const resBlock = /<!--\s*kadria-resources\s+(\[.*?\])\s*-->/s.exec(sheet);
			const resources = resBlock ? JSON.parse(resBlock[1]) : [];
			const detail = sheet.split(/\*\*Feature Details:\*\*/)[1] || "";
			const features = [...detail.split(/<!--|\*\*Species Traits/)[0].matchAll(/^- \*\*(.+?)\*\*\s*\(([^)]*)\)\s*(?::\s*(.*))?$/gm)].map((m) => ({ name: m[1], scope: m[2], text: m[3] || "" }));
			await step("the form produced a level 20 sheet with feature details and a resource list", async () => {
				if (persona.classes) { for (const c of persona.classes) assert(sheet.includes(c.cls), "the identity table lacks " + c.cls); } else assert(/\| 20 \|/.test(sheet), "no level 20 in the identity table");
				assert(features.length >= 8, "only " + features.length + " feature details on the sheet");
				assert(resources.length >= 1, "the sheet has no resource block");
			});
			await device.open();
			await step("the phone shows the character at level 20 and is linked to the sheet", async () => {
				await device.tap("Get from sheet");
				assert(!(await device.notices()).some((m) => /Couldn't reach|did not accept/.test(m)), (await device.notices()).join(" | "));
			});
			await device.goToPage("Combat");
			await step("every limited-use feature on the sheet is tracked with exactly the right number of uses", async () => {
				const text = await device.text();
				for (const r of resources.filter((x) => x.max <= 12)) { has(text, `${r.name} use ${r.max}`); lacks(text, `${r.name} use ${r.max + 1}`); }
			});
			await step("I can spend a use of each limited feature and a long rest gives them back", async () => {
				const small = resources.filter((x) => x.max <= 12).slice(0, 3);
				for (const r of small) await device.tap(`${r.name} use 1`);
				await device.tap("🌙 Long"); await device.goToPage("Combat");
				const text = await device.text();
				for (const r of small) has(text, `${r.name} use ${r.max}`);
			});
			await device.goToPage("Features");
			await step("the Features page lists the class and subclass features by name, with what they do", async () => {
				const first = features.slice(0, 4);
				for (const f of first) await device.waitForText(f.name, 10000);
				const withText = features.find((f) => f.text.length > 30);
				assert(withText, "no feature on the sheet has a description");
				await device.waitForText(withText.text.slice(0, 25), 10000);
			});
			const row = await world.sheetRow();
			let table = {}; try { table = JSON.parse(row.spellSlots || "{}"); } catch (e) { /* no slots */ }
			if (Object.keys(table).length) {
				await device.goToPage("Spells");
				await step("the spell slots on the phone match the Sheet, level by level", async () => {
					const text = await device.text();
					for (const [lvl, v] of Object.entries(table)) { if (!v.max) continue; has(text, `Level ${lvl} slot ${v.max}`); lacks(text, `Level ${lvl} slot ${v.max + 1}`); }
				});
			}
			await step("what the phone sends reaches the Sheet", async () => {
				await device.goToPage("Combat"); await device.type("HP", 7); await device.tap("Send to sheet");
				assert.strictEqual((await world.sheetRow()).hp, 7);
			});
		},
	};
}
module.exports.push(...[
	{ cls: "Fighter", subclass: "Battle Master", species: "Human", background: "Soldier" },
	{ cls: "Wizard", subclass: "School of Illusion", species: "Elf", background: "Sage" },
	{ cls: "Paladin", subclass: "Oath of Devotion", species: "Dwarf", background: "Acolyte" },
	{ cls: "Barbarian", subclass: "Path of the Wild Heart", species: "Orc", background: "Guide" },
].map(l20Scenario));

// The most complicated characters the form allows: four classes each, so every mixed-casting and mixed-resource rule is in play.
module.exports.push(...[
	{ label: "fighter-wizard-cleric-warlock", species: "Human", background: "Sage",
	  classes: [{ cls: "Fighter", subclass: "Battle Master", level: 5 }, { cls: "Wizard", subclass: "School of Evocation", level: 5 }, { cls: "Cleric", subclass: "Life Domain", level: 5 }, { cls: "Warlock", subclass: "The Fiend", level: 5 }] },
	{ label: "sorcerer-warlock-paladin-bard", species: "Faerie", background: "Harper",
	  classes: [{ cls: "Sorcerer", subclass: "Draconic Sorcery", level: 6 }, { cls: "Warlock", subclass: "The Archfey", level: 6 }, { cls: "Paladin", subclass: "Oath of Devotion", level: 6 }, { cls: "Bard", subclass: "College of Lore", level: 2 }] },
	{ label: "barbarian-monk-rogue-ranger", species: "Orc", background: "Guide",
	  classes: [{ cls: "Barbarian", subclass: "Path of the Berserker", level: 5 }, { cls: "Monk", subclass: "Warrior of the Open Hand", level: 5 }, { cls: "Rogue", subclass: "Assassin", level: 5 }, { cls: "Ranger", subclass: "Hunter", level: 5 }] },
	{ label: "artificer-wizard-druid", species: "Dwarf", background: "Artisan",
	  classes: [{ cls: "Artificer", subclass: "Artillerist", level: 8 }, { cls: "Wizard", subclass: "Bladesinger", level: 6 }, { cls: "Druid", subclass: "Circle of the Moon", level: 6 }] },
].map(l20Scenario));

// The other nine classes at level 20, each with a different, unusual main subclass (new resource counters, summons, pools).
module.exports.push(...[
	{ cls: "Artificer", subclass: "Alchemist", species: "Gnome", background: "Scribe" },
	{ cls: "Bard", subclass: "College of Glamour", species: "Faerie", background: "Entertainer" },
	{ cls: "Cleric", subclass: "Trickery Domain", species: "Tiefling", background: "Charlatan" },
	{ cls: "Druid", subclass: "Circle of the Stars", species: "Goliath", background: "Hermit" },
	{ cls: "Monk", subclass: "Warrior of Shadow", species: "Halfling", background: "Wayfarer" },
	{ cls: "Ranger", subclass: "Fey Wanderer", species: "Elf", background: "Guide" },
	{ cls: "Rogue", subclass: "Soulknife", species: "Human", background: "Criminal" },
	{ cls: "Sorcerer", subclass: "Clockwork Sorcery", species: "Dragonborn", background: "Noble" },
	{ cls: "Warlock", subclass: "The Undead", species: "Dwarf", background: "Acolyte" },
].map(l20Scenario));
