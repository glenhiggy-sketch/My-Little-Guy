// Compares each generated level-9 sheet with what My Little Guy extracts from it, and lists the limited-use features
// (2024 rules) a player has to track at the table versus what the plugin tracks for them.
"use strict";
const fs = require("fs"), path = require("path");
const parse = require("./parse-dump");
const dir = path.join(__dirname, "chars");
// Limited-use class resources at level 9 (D&D 2024 SRD 5.2). `name` is what a player would expect to see as a counter.
const LIMITED = {
	Barbarian: [["Rage", 4, "long (1 back on short)"]],
	Bard: [["Bardic Inspiration", "CHA mod", "long (short from lvl 5)"]],
	Cleric: [["Channel Divinity", 2, "short (1) / long (all)"]],
	Druid: [["Wild Shape", 2, "short (1) / long (all)"]],
	Fighter: [["Second Wind", 3, "short (1) / long (all)"], ["Action Surge", 1, "short"], ["Indomitable", 1, "long"]],
	Monk: [["Focus Points", 9, "short"], ["Uncanny Metabolism", 1, "long"]],
	Paladin: [["Lay on Hands (pool)", 45, "long"], ["Channel Divinity", 2, "short (1) / long (all)"]],
	Ranger: [["Hunter's Mark free casts", 4, "long"]],
	Rogue: [],
	Sorcerer: [["Sorcery Points", 9, "long"], ["Innate Sorcery", 2, "long"], ["Sorcerous Restoration", 1, "long"]],
	Warlock: [["Magical Cunning", 1, "long"]],
	Wizard: [["Arcane Recovery", 1, "long"]],
	Artificer: [["Flash of Genius", "INT mod", "long"], ["Magical Tinkering", "INT mod", "long"]],
};
const rows = [], notes = [];
for (const f of fs.readdirSync(dir).sort()) {
	const cls = f.replace(".md", ""), text = fs.readFileSync(path.join(dir, f), "utf8"), o = parse(text);
	const cfLine = (/\*\*Class Features \([^)]+\):\*\*[ \t]*(.+)/.exec(text) || [])[1] || "";
	const cfNames = cfLine.split(/,\s*(?=[A-Z][^,]*?:|Feat)/).map((s) => s.trim()).filter(Boolean);
	const traitText = JSON.stringify(o.traits || []);
	const missingFeat = cfNames.filter((n) => !traitText.includes(n.split(": ").pop().slice(0, 25)) && n.length > 3);
	const mdSpells = [...text.matchAll(/!\[\[Books\/Spells\/[^\]]+?\/([^\]/]+)\.md\]\]/g)].map((m) => m[1]);
	const parsedSpells = Object.values(o.spells_by_level || {}).flat().map((s) => (s && (s.name || s)) + "");
	const spellMiss = [...new Set(mdSpells)].filter((n) => !parsedSpells.some((p) => p.toLowerCase().includes(n.toLowerCase())));
	const attackSec = (/### Attacks & Spellcasting([\s\S]*?)\r?\n---/.exec(text) || [, ""])[1];
	const attackRows = [...attackSec.matchAll(/^\| ([A-Z][^|]+?) \| [+-]\d+ \| [^|]+\|$/gm)].map((m) => m[1].trim());
	const actionNames = (o.actions || []).map((a) => a.name);
	const attackMiss = attackRows.filter((n) => !actionNames.includes(n));
	const equip = [...(/## Equipment\s+([\s\S]*?)\n\s*\*\*Currency/.exec(text) || [, ""])[1].matchAll(/^- (.+)$/gm)].map((m) => m[1].trim());
	const invMiss = equip.filter((n) => !(o.inventory || []).some((i) => i.name === n));
	const slotMd = (/\*\*Spell Slots:\*\*[ \t]*(.+)/.exec(text) || [])[1];
	const lim = LIMITED[cls] || [];
	const tracked = (o.features || []).length;
	const subclassGeneric = (cfLine.match(/Subclass Feature/g) || []).length;
	rows.push({ cls, subclass: o.subclass, features: cfNames.length, featuresShown: cfNames.length - missingFeat.length, spellsInSheet: new Set(mdSpells).size, spellsParsed: parsedSpells.length, spellMiss, attackMiss, invMiss, lim, tracked, subclassGeneric, pact: !!o.pact_slots, slotMd });
}
console.log("class | subclass | class-feature names in sheet / shown | spells in sheet / parsed | attacks missing | gear missing | limited-use features (expected) | tracked by plugin | generic 'Subclass Feature' placeholders");
for (const r of rows) console.log([r.cls, r.subclass, `${r.features}/${r.featuresShown}`, `${r.spellsInSheet}/${r.spellsParsed}`, r.attackMiss.join(";") || "-", r.invMiss.join(";") || "-", r.lim.map((l) => `${l[0]} ${l[1]}`).join("; ") || "-", r.tracked, r.subclassGeneric].join(" | "));
for (const r of rows) { if (r.spellMiss.length) console.log("SPELLS NOT PARSED", r.cls, r.spellMiss.join(", ")); if (r.pact) console.log("pact slots parsed for", r.cls); }
module.exports = { rows, LIMITED };
