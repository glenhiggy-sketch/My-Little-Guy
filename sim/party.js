// Ten-player, all-multiclass party, end to end against the REAL form link and the REAL Sheet (test hook for the DM side).
//   SIM_PIN_IP=<google ip> node sim/party.js [--keep]
// Steps, in order: every player follows the form link and builds a multiclass character; each sheet is read (as the Drive link would
// deliver it); each player pulls through the sheet's own sync link; the DM puts all ten in one party, awards gold and publishes once;
// each player pulls again and must see the party and ONLY their own award; players push changes and must not touch each other;
// a wrong token must be refused. Test data is removed at the end (the hook's cleanup) unless --keep.
"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert");
const { buildCharacter } = require("./live/form");
const ENDPOINT = process.env.SIM_ENDPOINT || "https://script.google.com/macros/s/AKfycbzpd3dobDjH70Nr9mHKBIlrtUE4HSW8I_rW_se_s5PjX8dCxyCIkCug1UN9M00vhadi/exec";
const secret = () => { if (process.env.TEST_HOOK_SECRET) return process.env.TEST_HOOK_SECRET; const m = /^TEST_HOOK_SECRET=(.+)$/m.exec(fs.readFileSync(path.join(__dirname, ".env.local"), "utf8")); return m[1].trim(); };

async function http(url, opts) {
	for (let a = 0; ; a++) {
		try { const r = await fetch(url, { redirect: "follow", ...opts }); const t = await r.text(); try { return JSON.parse(t); } catch (e) { if (a >= 3) throw new Error("non-JSON answer: " + t.slice(0, 100)); } }
		catch (e) { if (a >= 3) throw e; }
		await new Promise((r) => setTimeout(r, 3000));
	}
}
const post = (body) => http(ENDPOINT, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "text/plain" } });
const hook = async (op, extra) => { const r = await post({ action: "testhook", secret: secret(), op, ...extra }); if (!r.ok) throw new Error(`hook ${op}: ${r.error}`); return r; };
const pull = (id, token) => http(`${ENDPOINT}?action=pull&id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`);

const PARTY = "The Ten Blades";
const members = [
	{ who: "Rogue/Wizard", classes: [{ cls: "Rogue", subclass: "Arcane Trickster", level: 6 }, { cls: "Wizard", subclass: "School of Illusion", level: 5 }], species: "Elf", background: "Criminal" },
	{ who: "Paladin/Sorcerer", classes: [{ cls: "Paladin", subclass: "Oath of Devotion", level: 7 }, { cls: "Sorcerer", subclass: "Draconic Sorcery", level: 5 }], species: "Dragonborn", background: "Noble" },
	{ who: "Cleric/Fighter", classes: [{ cls: "Cleric", subclass: "War Domain", level: 6 }, { cls: "Fighter", subclass: "Champion", level: 5 }], species: "Dwarf", background: "Soldier" },
	{ who: "Druid/Monk", classes: [{ cls: "Druid", subclass: "Circle of the Moon", level: 6 }, { cls: "Monk", subclass: "Warrior of the Open Hand", level: 5 }], species: "Goliath", background: "Hermit" },
	{ who: "Bard/Warlock", classes: [{ cls: "Bard", subclass: "College of Lore", level: 6 }, { cls: "Warlock", subclass: "The Fiend", level: 5 }], species: "Tiefling", background: "Entertainer" },
	{ who: "Barbarian/Ranger", classes: [{ cls: "Barbarian", subclass: "Path of the Berserker", level: 5 }, { cls: "Ranger", subclass: "Hunter", level: 6 }], species: "Orc", background: "Guide" },
	{ who: "Artificer/Fighter", classes: [{ cls: "Artificer", subclass: "Battle Smith", level: 6 }, { cls: "Fighter", subclass: "Battle Master", level: 5 }], species: "Gnome", background: "Artisan" },
	{ who: "Wizard/Cleric", classes: [{ cls: "Wizard", subclass: "School of Divination", level: 6 }, { cls: "Cleric", subclass: "Knowledge Domain", level: 5 }], species: "Halfling", background: "Sage" },
	{ who: "Ranger/Rogue", classes: [{ cls: "Ranger", subclass: "Gloom Stalker", level: 6 }, { cls: "Rogue", subclass: "Assassin", level: 5 }], species: "Faerie", background: "Harper" },
	{ who: "Monk/Barbarian/Warlock", classes: [{ cls: "Monk", subclass: "Warrior of Mercy", level: 4 }, { cls: "Barbarian", subclass: "Path of the Wild Heart", level: 4 }, { cls: "Warlock", subclass: "The Great Old One", level: 3 }], species: "Human", background: "Wayfarer" },
];

(async () => {
	const tag = String(Date.now()).slice(-6), keep = process.argv.includes("--keep");
	const log = (m) => console.log(m);
	const checks = []; const ok = (name, cond, detail = "") => { checks.push([name, !!cond]); log(`  ${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : "  " + detail}`); };
	const chars = members.map((m, i) => ({ ...m, character: `ZZSTRESS_Party ${tag}-${i + 1}`, player: `ZZSTRESS_p${tag}${i + 1}`, level: m.classes.reduce((s, c) => s + c.level, 0) }));
	try {
		log(`1. ten players follow the form link (${chars.length} builds, 3 at a time)`);
		const queue = chars.slice(), failed = [];
		await Promise.all(Array.from({ length: 3 }, async () => { while (queue.length) { const c = queue.shift(); try { await buildCharacter({ ...c, alignment: "Neutral Good" }); log(`   built ${c.who} (level ${c.level})`); } catch (e) { failed.push(`${c.who}: ${String(e.message).slice(0, 120)}`); } } }));
		ok("all ten characters were created through the form", failed.length === 0, failed.join(" | "));
		const built = chars.filter((c) => !failed.some((f) => f.startsWith(c.who + ":")));

		log("2. each player's sheet arrives (Drive link) and carries its own sync link");
		for (const c of built) {
			let r; for (let i = 0; i < 20; i++) { r = await post({ action: "testhook", secret: secret(), op: "file", name: c.character, player: c.player }); if (r.ok) break; await new Promise((x) => setTimeout(x, 3000)); }
			c.sheet = r.text; const m = /<!-- kadria-sync (\{.*?\}) -->/.exec(r.text || ""); c.sync = m && JSON.parse(m[1]);
		}
		ok("every sheet has a sync link", built.every((c) => c.sync && c.sync.id && c.sync.token));
		ok("every sheet names all of its classes", built.every((c) => c.classes.every((k) => (c.sheet || "").includes(k.cls))), built.filter((c) => !c.classes.every((k) => (c.sheet || "").includes(k.cls))).map((c) => c.who).join(","));
		ok("every sheet has feature details and a resource list", built.every((c) => /\*\*Feature Details:\*\*/.test(c.sheet) && /kadria-resources/.test(c.sheet)));
		ok("ten distinct ids and tokens", new Set(built.map((c) => c.sync.id)).size === built.length && new Set(built.map((c) => c.sync.token)).size === built.length);

		log("3. each player pulls through their own link");
		for (const c of built) { c.pull0 = await pull(c.sync.id, c.sync.token); }
		ok("every pull works and returns that character's own HP and slots", built.every((c) => c.pull0.ok && c.pull0.playerOwned && c.pull0.playerOwned.hp > 0));
		ok("nobody is in a party yet", built.every((c) => !c.pull0.dm.party));

		log("4. the DM puts all ten in one party, awards gold and publishes once");
		for (let i = 0; i < built.length; i++) {
			const c = built[i];
			await hook("draft", { name: c.character, player: c.player, party: PARTY, conditions: i % 3 === 0 ? "Blessed" : "", notes: `Note for ${i + 1}` });
			await hook("award", { name: c.character, player: c.player, amount: 100 + i * 10, reason: `Session 1 (${i + 1})` });
		}
		const early = await pull(built[0].sync.id, built[0].sync.token);
		ok("before Publish nobody sees the draft", !early.dm.party && (early.awards || []).length === 0, JSON.stringify(early.dm));
		const pub = await hook("publish");
		ok("one publish covers all ten characters and ten awards", pub.characters === built.length && pub.awards === built.length, JSON.stringify(pub));

		log("5. each player pulls again");
		for (let i = 0; i < built.length; i++) {
			const c = built[i]; c.pull1 = await pull(c.sync.id, c.sync.token);
			c.myAward = (c.pull1.awards || []);
		}
		ok("every player sees the party", built.every((c) => c.pull1.dm.party === PARTY));
		ok("every player sees exactly their own award", built.every((c, i) => c.myAward.length === 1 && Number(c.myAward[0].amount) === 100 + i * 10), JSON.stringify(built.map((c) => c.myAward.map((a) => a.amount))));
		ok("gold on the sheet was not changed by the award", built.every((c, i) => c.pull1.playerOwned.gold === c.pull0.playerOwned.gold));
		ok("conditions and notes arrive per character", built.every((c, i) => c.pull1.dm.notes === `Note for ${i + 1}` && (i % 3 === 0 ? c.pull1.dm.conditions === "Blessed" : !c.pull1.dm.conditions)));

		log("6. players push their own changes; nobody can touch anyone else");
		await Promise.all(built.map((c, i) => post({ action: "push", id: c.sync.id, token: c.sync.token, fields: { hp: i + 1, gold: 500 + i, inventory: `Item ${i + 1}` } })));
		const after = []; for (const c of built) after.push(await pull(c.sync.id, c.sync.token));
		ok("each character holds only its own pushed values", after.every((r, i) => r.playerOwned.hp === i + 1 && r.playerOwned.gold === 500 + i && r.playerOwned.inventory === `Item ${i + 1}`));
		const bad = await post({ action: "push", id: built[0].sync.id, token: built[1].sync.token, fields: { hp: 999 } });
		ok("player 2's token cannot write player 1's character", bad.ok === false);
		const dmField = await post({ action: "push", id: built[0].sync.id, token: built[0].sync.token, fields: { party: "Hijack" } });
		ok("a player cannot write the DM's party field", (dmField.rejected || []).some((x) => /party/.test(x)) || dmField.ok === false, JSON.stringify(dmField));
		const still = await pull(built[0].sync.id, built[0].sync.token);
		ok("the party is unchanged after the attempts", still.dm.party === PARTY && still.playerOwned.hp === 1);

		const failedChecks = checks.filter((c) => !c[1]);
		log(`\n${checks.length - failedChecks.length} of ${checks.length} checks passed`);
		if (failedChecks.length) process.exitCode = 1;
		fs.writeFileSync(path.join(__dirname, "reports", `party-${tag}.json`), JSON.stringify({ tag, checks, characters: built.map((c) => ({ who: c.who, level: c.level, id: c.sync && c.sync.id })) }, null, 2));
	} finally {
		if (!keep) { try { const r = await hook("cleanup"); log("cleanup: " + JSON.stringify(r)); } catch (e) { log("cleanup failed: " + e.message); } }
	}
})();
