// Unit tests for the values the panel works out itself: passives, hit dice, short rest, level cap, class training, languages.
// Run: node test/derived.test.js
"use strict";
const assert = require("assert");
const { makeHarness } = require("./harness");
const { C } = makeHarness();

let n = 0; const ok = (name, fn) => { fn(); n++; console.log("  ok  " + name); };
const abil = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { score: v }]));

ok("passive scores follow ability scores and skill proficiency (none, half, prof, expertise)", () => {
	const fm = { level: 5, abilities: abil({ wis: 14, int: 12 }), skills: { perception: { prof: "expertise" }, insight: { prof: "prof" }, investigation: { prof: "half" } } };
	assert.strictEqual(C.passiveScore(fm, "perception"), 10 + 2 + 2 * 3);   // +2 WIS, expertise = 2 x prof (+3 at level 5)
	assert.strictEqual(C.passiveScore(fm, "insight"), 10 + 2 + 3);
	assert.strictEqual(C.passiveScore(fm, "investigation"), 10 + 1 + 1);    // +1 INT, half prof rounds down
	assert.strictEqual(C.passiveScore({ level: 1, abilities: abil({ wis: 10 }) }, "perception"), 10);
	fm.skills.perception.prof = "none";
	assert.strictEqual(C.passiveScore(fm, "perception"), 12, "removing the proficiency lowers it at once");
});

ok("hit dice: one pool for a single class, one per die size for a multiclass", () => {
	const single = C.hitDicePools({ class: "Fighter", level: 4, hit_dice_used: 1 });
	assert.deepStrictEqual(Array.from(single, (p) => [p.die, p.total, p.left]), [[10, 4, 3]]);
	const multi = C.hitDicePools({ classes: [{ name: "Fighter", level: 3 }, { name: "Wizard", level: 2 }, { name: "Cleric", level: 1 }] });
	assert.deepStrictEqual(Array.from(multi, (p) => [p.die, p.total]), [[10, 3], [8, 1], [6, 2]]);
});

ok("spending hit dice updates the pool and keeps the old counter in step; none left means no spend", () => {
	const f = { classes: [{ name: "Fighter", level: 1 }, { name: "Wizard", level: 1 }] };
	assert.strictEqual(C.spendHitDie(f, 10), true);
	assert.strictEqual(C.spendHitDie(f, 10), false);
	assert.strictEqual(f.hit_dice_used, 1);
	assert.deepStrictEqual(Array.from(C.hitDicePools(f), (p) => p.left), [0, 1]);
});

ok("a long rest returns half the hit dice, at least one, biggest first", () => {
	const f = { classes: [{ name: "Fighter", level: 4 }, { name: "Wizard", level: 4 }], hit_dice_spent: { 10: 4, 6: 4 } };
	C.recoverHitDice(f);
	assert.deepStrictEqual(Array.from(C.hitDicePools(f), (p) => p.left), [4, 0]);
	const one = { class: "Wizard", level: 1, hit_dice_used: 1 };
	C.recoverHitDice(one);
	assert.strictEqual(one.hit_dice_used, 0);
});

ok("short rest preview and effect: full for short features, one use for Rage-style ones, nothing for the rest", () => {
	const fm = { class: "Barbarian", level: 5, pact_slots: { max: 2, used: 2 }, features: [
		{ name: "Rage", max: 3, used: 3, recovery: "long" }, { name: "Action Surge", max: 1, used: 1, recovery: "short" }, { name: "Indomitable", max: 1, used: 1, recovery: "long" } ] };
	const p = C.shortRestPreview(fm);
	assert.deepStrictEqual(Array.from(p.full, (x) => x.name), ["Action Surge"]);
	assert.deepStrictEqual(Array.from(p.one, (x) => x.name), ["Rage"]);
	assert(p.pact);
	const f = JSON.parse(JSON.stringify(fm)); C.applyShortRest(f);
	assert.strictEqual(f.features[0].used, 2); assert.strictEqual(f.features[1].used, 0); assert.strictEqual(f.features[2].used, 1); assert.strictEqual(f.pact_slots.used, 0);
	const wiz = C.shortRestPreview({ class: "Wizard", level: 5, classes: [{ name: "Wizard", level: 5 }] });
	assert(/Arcane Recovery.*3 levels/.test(wiz.choices[0]), wiz.choices[0]);
});

ok("level 20 is the ceiling, multiclass included; proficiency bonus stops at +6", () => {
	assert.strictEqual(C.MAX_LEVEL, 20);
	assert.strictEqual(C.getTotalLevel({ classes: [{ name: "Fighter", level: 12 }, { name: "Wizard", level: 8 }] }), 20);
	assert.strictEqual(C.getProficiencyBonus({ level: 25 }), 6);
});

ok("armor and weapon training come from the class; a multiclass only gains the multiclass subset", () => {
	const pal = C.classTraining({ class: "Paladin" });
	assert.deepStrictEqual(Array.from(pal.armor), ["Light armor", "Medium armor", "Heavy armor", "Shields"]);
	assert.deepStrictEqual(Array.from(pal.weapons), ["Simple weapons", "Martial weapons"]);
	const mc = C.classTraining({ classes: [{ name: "Wizard", level: 3 }, { name: "Fighter", level: 2 }] });
	assert(!mc.armor.includes("Heavy armor") && mc.armor.includes("Medium armor") && mc.weapons.includes("Martial weapons"));
	assert.strictEqual(C.classTraining({ class: "Homebrew Thing" }), null);
});

ok("languages are split one per language; unknown wording is kept as written", () => {
	assert.deepStrictEqual(Array.from(C.languagesIn("Common and Giant.")), ["Common", "Giant"]);
	assert.deepStrictEqual(Array.from(C.languagesIn("Common Sign Language, Thieves' Cant and Elvish")), ["Common Sign Language", "Thieves' Cant", "Elvish"]);
	assert.deepStrictEqual(Array.from(C.languagesIn("Orcish uncommon")), []);
});

ok("the sheet parser: one chip per language, tools kept apart, class training filled, a Languages line wins", () => {
	const body = ["| Character Name | Player Name | Class & Subclass | Species | Level | Background | Alignment |", "|---|---|---|---|---|---|---|",
		"| Aelen | Erin | Paladin (Devotion) | Goliath | 3 | Soldier | LG |", "", "**Species Traits (Goliath):**", "- **Languages.** Common and Giant.", "",
		"**Languages & Proficiencies:** Gaming Set (Dice Set)"].join("\n");
	let r = C.parseSheetBody(body);
	assert.deepStrictEqual(Array.from(r.proficiencies.languages), ["Common", "Giant"]);
	assert.deepStrictEqual(Array.from(r.proficiencies.tools), ["Gaming Set (Dice Set)"]);
	assert(r.proficiencies.armor.includes("Heavy armor") && r.proficiencies.weapons.includes("Martial weapons"));
	r = C.parseSheetBody(body + "\n**Languages:** Common, Giant, Elvish");
	assert.deepStrictEqual(Array.from(r.proficiencies.languages), ["Common", "Giant", "Elvish"]);
});

ok("every background has an entry the Background page can show", () => {
	assert(C.BACKGROUND_INFO.sage && C.BACKGROUND_INFO.sage.f === "Magic Initiate (Wizard)" && C.BACKGROUND_INFO.sage.s.length === 2);
});

console.log("\n" + n + " checks passed");
