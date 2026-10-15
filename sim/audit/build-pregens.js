// Builds the pregenerated characters with the REAL Intake generator (Generator.js, TemplateFiller.js, PdfFiller.js, run locally in a vm) from
// hand-made choices, and writes <name>.md + <name>.pdf plus an index into the Kadria project folder.
//   NODE_PATH=<node_modules with nothing special> node build-pregens.js [outDir]
// The Pugilist is a parked homebrew class (vault: Homebrew/_deprecated/Pugilist): its feature text is read from that note at build time.
"use strict";
const vm = require("vm"), fs = require("fs"), path = require("path");
const { load } = require("./local-build");
const DIR = process.env.APPSCRIPT_DIR || "B:/New folder/Second Brain.vault/_Agent-Only/code/kadria-appscript";
const OUT = process.argv[2] || "B:/New folder/Second Brain.vault/projects/kadria-universe/Kadria/pregens";
const LEVEL = Number(process.env.PREGEN_LEVEL || 5);

// ---- the eight: four martial, four casters (Paladin is the martial who casts) -------------------------------------------------------
const P = [
	{ file: "01 Brakka Stonefist - Pugilist (Slugger)", name: "Brakka Stonefist", cls: "Pugilist", sub: "Slugger", species: "Goliath", background: "Guard", align: "Lawful Neutral",
	  scores: { Strength: 14, Dexterity: 13, Constitution: 15, Intelligence: 8, Wisdom: 12, Charisma: 10 }, bg: { mode: "2/1", plus2: "Strength", plus1: "Wisdom" },
	  skills: ["Acrobatics", "Intimidation"], tool: "Dice Set", asi: [{ plus2: "Strength" }],
	  role: "Martial / brawler", blurb: "Fights bare-fisted. Builds Flow with every hit you land or attack you avoid, then spends it on Tricks and counters.",
	  tips: ["Your fists use the Pugilism die; Strength or Dexterity, your choice.", "Unarmored AC is 13 + Con.", "Spend Flow on Tricks (bonus action) and Brace (reaction to turn a crit into a hit)."],
	  choices: "Goliath: Giant Ancestry = Stone's Endurance. Boxing Style: Slugger." },
	{ file: "02 Varga Ironhide - Barbarian (Berserker)", name: "Varga Ironhide", cls: "Barbarian", sub: "Path of the Berserker", species: "Orc", background: "Farmer", align: "Chaotic Good",
	  scores: { Strength: 15, Dexterity: 13, Constitution: 14, Intelligence: 8, Wisdom: 12, Charisma: 10 }, bg: { mode: "2/1", plus2: "Strength", plus1: "Constitution" },
	  skills: ["Athletics", "Perception"], tool: "Carpenter's Tools", asi: [{ feat: "Great Weapon Master", inc: "Strength" }],
	  masteries: ["Greataxe", "Handaxe", "Javelin"],
	  role: "Martial / frontline", blurb: "Rages, hits hard, soaks damage. Simple to run and very hard to put down.",
	  tips: ["Bonus action: Rage. Reckless Attack for advantage when you want to end a fight fast.", "Frenzy adds damage to the first hit each turn while raging.", "Adrenaline Rush (Orc) is a free Dash with temporary hit points."],
	  choices: "Orc: Adrenaline Rush, Relentless Endurance, Darkvision 120 ft." },
	{ file: "03 Tansy Underbough - Rogue (Thief)", name: "Tansy Underbough", cls: "Rogue", sub: "Thief", species: "Halfling", background: "Criminal", align: "Chaotic Neutral",
	  scores: { Strength: 8, Dexterity: 15, Constitution: 14, Intelligence: 12, Wisdom: 13, Charisma: 10 }, bg: { mode: "2/1", plus2: "Dexterity", plus1: "Constitution" },
	  skills: ["Acrobatics", "Perception", "Investigation", "Persuasion"], tool: "Thieves' Tools", asi: [{ plus2: "Dexterity" }],
	  masteries: ["Rapier", "Dagger"], expertise: ["Stealth", "Perception"],
	  role: "Martial / skills and sneak attacks", blurb: "Scout, lock-picker and opportunist. Wins fights with one well-placed Sneak Attack per turn.",
	  tips: ["Sneak Attack once per turn with advantage or an ally next to the target.", "Cunning Action: Dash, Disengage or Hide as a bonus action.", "Fast Hands (Thief) lets you use an object or Sleight of Hand as a bonus action."],
	  choices: "Halfling: Lucky, Brave, Halfling Nimbleness, Naturally Stealthy." },
	{ file: "04 Kavaxis Dawnmantle - Paladin (Devotion)", name: "Kavaxis Dawnmantle", cls: "Paladin", sub: "Oath of Devotion", species: "Dragonborn", background: "Soldier", align: "Lawful Good",
	  scores: { Strength: 15, Dexterity: 10, Constitution: 13, Intelligence: 8, Wisdom: 12, Charisma: 14 }, bg: { mode: "2/1", plus2: "Strength", plus1: "Constitution" },
	  skills: ["Insight", "Persuasion"], tool: "Dice Set", asi: [{ plus2: "Strength" }], style: "Defense",
	  masteries: ["Longsword", "Warhammer"],
	  spells: { cantrips: [], spells: ["Bless", "Cure Wounds", "Command", "Divine Favor", "Lesser Restoration", "Find Steed"] },
	  role: "Martial caster / defender and healer", blurb: "Sword-and-shield knight who heals in a pinch and smites for extra radiance.",
	  tips: ["Divine Smite: spend a spell slot after a hit for extra radiant damage.", "Lay On Hands is a pool of healing you can touch to spend.", "Oath spells are always prepared."],
	  choices: "Dragonborn: Draconic Ancestry = Gold (fire breath). Fighting Style: Defense. Oath of Devotion spells, always prepared: Protection from Evil and Good, Shield of Faith (3rd level); Aid, Zone of Truth (5th)." },
	{ file: "05 Brenna Hearthward - Cleric (Life)", name: "Brenna Hearthward", cls: "Cleric", sub: "Life Domain", species: "Dwarf", background: "Acolyte", align: "Neutral Good",
	  scores: { Strength: 13, Dexterity: 10, Constitution: 14, Intelligence: 8, Wisdom: 15, Charisma: 12 }, bg: { mode: "2/1", plus2: "Wisdom", plus1: "Charisma" },
	  skills: ["Medicine", "Persuasion"], tool: "Calligrapher's Supplies", asi: [{ feat: "War Caster", inc: "Wisdom" }],
	  spells: { cantrips: ["Guidance", "Sacred Flame", "Spare the Dying", "Thaumaturgy"],
	            spells: ["Healing Word", "Guiding Bolt", "Shield of Faith", "Sanctuary", "Command", "Spiritual Weapon", "Spirit Guardians", "Dispel Magic", "Protection from Evil and Good"] },
	  role: "Caster / healer", blurb: "The party's healer and anchor, in heavy armor. Healing Word from range keeps everyone standing.",
	  tips: ["Healing Word is a bonus action: heal a downed ally and still act.", "Spiritual Weapon is a bonus-action attack every turn.", "Channel Divinity: Preserve Life heals a crowd at once."],
	  choices: "Dwarf: Dwarven Resilience, Stonecunning. Divine Order: Protector. Magic Initiate (Cleric): cantrips Light and Mending, spell Bane. Life Domain spells, always prepared: Aid, Bless, Cure Wounds, Lesser Restoration; Mass Healing Word, Revivify at 5th." },
	{ file: "06 Thalior Venn - Wizard (Evocation)", name: "Thalior Venn", cls: "Wizard", sub: "School of Evocation", species: "Elf", background: "Sage", align: "Neutral Good",
	  scores: { Strength: 8, Dexterity: 13, Constitution: 14, Intelligence: 15, Wisdom: 12, Charisma: 10 }, bg: { mode: "2/1", plus2: "Intelligence", plus1: "Constitution" },
	  skills: ["Arcana", "Investigation"], tool: "Calligrapher's Supplies", asi: [{ plus2: "Intelligence" }],
	  spells: { cantrips: ["Fire Bolt", "Mage Hand", "Light", "Ray of Frost"],
	            spells: ["Magic Missile", "Shield", "Mage Armor", "Sleep", "Detect Magic", "Misty Step", "Scorching Ray", "Fireball", "Counterspell"] },
	  role: "Caster / damage and control", blurb: "Glass cannon with the answer to most problems. Sculpt Spells keeps allies safe from your own fireballs.",
	  tips: ["Keep Shield and Counterspell for your reactions.", "Sculpt Spells: protect allies from your area spells.", "Arcane Recovery restores slots after a short rest."],
	  choices: "Elf: Elven Lineage = High Elf (Prestidigitation). Scholar: Arcana. Magic Initiate (Wizard): cantrips Minor Illusion and Shocking Grasp, spell Find Familiar." },
	{ file: "07 Marlowe Vesper - Bard (Lore)", name: "Marlowe Vesper", cls: "Bard", sub: "College of Lore", species: "Tiefling", background: "Entertainer", align: "Chaotic Good",
	  scores: { Strength: 8, Dexterity: 14, Constitution: 13, Intelligence: 10, Wisdom: 12, Charisma: 15 }, bg: { mode: "2/1", plus2: "Charisma", plus1: "Dexterity" },
	  skills: ["Persuasion", "Insight", "Deception"], tool: "Lute", asi: [{ feat: "Inspiring Leader", inc: "Charisma" }], expertise: ["Persuasion", "Insight"],
	  spells: { cantrips: ["Vicious Mockery", "Minor Illusion", "Mending"],
	            spells: ["Healing Word", "Dissonant Whispers", "Faerie Fire", "Hideous Laughter", "Heroism", "Hold Person", "Invisibility", "Hypnotic Pattern", "Dispel Magic"] },
	  role: "Caster / support and face", blurb: "Talker, healer and buffer. Bardic Inspiration turns a miss into a hit for any ally.",
	  tips: ["Bardic Inspiration is a bonus action: give an ally a die to add to a roll.", "Cutting Words (Lore) uses a die to shrink an enemy's roll.", "Vicious Mockery is a free ranged attack and a debuff."],
	  choices: "Tiefling: Fiendish Legacy = Infernal (fire resistance, Fire Bolt; Hellish Rebuke at 3rd level, Darkness at 5th). Musician: Lute, Flute, Drum." },
	{ file: "08 Fennick Mossgrove - Druid (Land)", name: "Fennick Mossgrove", cls: "Druid", sub: "Circle of the Land", species: "Gnome", background: "Hermit", align: "Neutral",
	  scores: { Strength: 8, Dexterity: 13, Constitution: 14, Intelligence: 12, Wisdom: 15, Charisma: 10 }, bg: { mode: "2/1", plus2: "Wisdom", plus1: "Constitution" },
	  skills: ["Nature", "Perception"], tool: "Herbalism Kit", asi: [{ plus2: "Wisdom" }],
	  spells: { cantrips: ["Guidance", "Produce Flame", "Shillelagh"],
	            spells: ["Entangle", "Goodberry", "Healing Word", "Faerie Fire", "Moonbeam", "Pass without Trace", "Lesser Restoration", "Call Lightning", "Plant Growth"] },
	  role: "Caster / control and utility", blurb: "Nature's problem-solver: terrain control, healing, scouting and a Wild Shape when it counts.",
	  tips: ["Wild Shape: turn into a beast as a bonus action for extra hit points and mobility.", "Entangle and Moonbeam control a fight from a distance.", "Circle spells come with your land type (Temperate)."],
	  choices: "Gnome: Gnomish Lineage = Forest Gnome. Primal Order: Magician. Land Type: Temperate (its circle spells are always prepared)." },
];

// Curated kits, attack lines and AC (the generator picks the best armor a class is proficient with; these are what the character actually carries).
const KIT = {
	"Brakka Stonefist": { ac: 15, equipment: ["Handwraps (cloth)", "3 Javelins", "Explorer's Pack", "10 GP"],
		attacks: [["Unarmed Strike (Pugilism die)", "+7", "Pugilism die +4 bludgeoning"], ["Javelin (thrown 30/120)", "+7", "1d6+4 piercing"]] },
	"Varga Ironhide": { ac: null, equipment: ["Greataxe", "2 Handaxes", "4 Javelins", "Explorer's Pack", "15 GP"], attacks: null },
	"Tansy Underbough": { ac: null, equipment: ["Leather Armor", "Rapier", "2 Daggers", "Shortbow and 20 Arrows", "Thieves' Tools", "Burglar's Pack", "8 GP"],
		attacks: [["Rapier", "+7", "1d8+4 piercing"], ["Dagger (thrown 20/60)", "+7", "1d4+4 piercing"], ["Shortbow (80/320)", "+7", "1d6+4 piercing"]] },
	"Kavaxis Dawnmantle": { ac: 19, equipment: ["Chain Mail", "Shield", "Longsword", "5 Javelins", "Holy Symbol (amulet)", "Priest's Pack", "9 GP"],
		attacks: [["Longsword (Sap)", "+7", "1d8+4 slashing"], ["Javelin (thrown 30/120)", "+7", "1d6+4 piercing"]] },
	"Brenna Hearthward": { ac: 18, equipment: ["Chain Mail", "Shield", "Mace", "Holy Symbol (amulet)", "Priest's Pack", "7 GP"],
		attacks: [["Mace", "+4", "1d6+1 bludgeoning"]] },
	"Thalior Venn": { ac: null, equipment: ["Quarterstaff", "2 Daggers", "Spellbook", "Component Pouch", "Scholar's Pack", "5 GP"],
		attacks: [["Quarterstaff", "+2", "1d6-1 bludgeoning"], ["Dagger (thrown 20/60)", "+4", "1d4+1 piercing"]] },
	"Marlowe Vesper": { ac: null, equipment: ["Leather Armor", "Rapier", "2 Daggers", "Lute", "Entertainer's Pack", "11 GP"],
		attacks: [["Rapier", "+5", "1d8+2 piercing"], ["Dagger (thrown 20/60)", "+5", "1d4+2 piercing"]] },
	"Fennick Mossgrove": { ac: null, equipment: ["Leather Armor", "Wooden Shield", "Quarterstaff (druidic focus)", "Sickle", "Herbalism Kit", "Explorer's Pack", "9 GP"],
		attacks: [["Quarterstaff (Shillelagh)", "+7", "1d8+4 bludgeoning"], ["Sickle", "+2", "1d4-1 slashing"]] },
};

// ---- the Pugilist's rules text, from the vault note ---------------------------------------------------------------------------------
function pugilistRules() {
	const t = fs.readFileSync("C:/Kadria.vault/Books/Homebrew/_deprecated/Pugilist/Pugilist Main Profile.md", "utf8").replace(/\r\n/g, "\n");
	const feats = [];
	for (const m of t.matchAll(/^### (.+?) \((\d+)(?:st|nd|rd|th) Level\)\n([\s\S]*?)(?=\n### |\n## |$)/gm)) {
		const text = m[3].trim().replace(/\*\*/g, "").replace(/\s+/g, " ");
		feats.push({ n: m[1].trim(), l: [Number(m[2])], t: text.length > 260 ? text.slice(0, text.lastIndexOf(" ", 257)) + "..." : text });
	}
	return feats;
}
const STYLE = {
	Slugger: [
		{ n: "Brutal Swing", l: [3], t: "A hard swing that can force the target to move or stumble, punishing creatures you hit." },
		{ n: "Demoralizing Punch", l: [3], t: "A hit that shakes a foe's nerve, giving it disadvantage on its next attack roll." },
	],
};

async function main() {
	fs.mkdirSync(OUT, { recursive: true });
	const index = [];
	for (const p of P) {
		const ctx = load(1);
		if (p.cls === "Pugilist") {   // parked homebrew: add its rules text and Flow tracker for this build only
			ctx.KADRIA_RULES.classes.Pugilist = { features: pugilistRules() };
			ctx.KADRIA_RULES.subclasses["Pugilist|Slugger|2014"] = { features: STYLE.Slugger };
			ctx.KADRIA_RULES.resources.Pugilist = [{ n: "Flow", sub: "", from: 1, max: { pb: 1 }, rest: [[0, "short"]] }];
		}
		const classData = ctx.KADRIA_CLASSES.find((c) => c.name === p.cls);
		if (!classData) throw new Error("unknown class " + p.cls);
		const subclass = classData.subclasses.find((s) => s.name === p.sub && s.edition === "2024") || classData.subclasses.find((s) => s.name === p.sub);
		if (!subclass) throw new Error(`unknown subclass ${p.cls}: ${p.sub} (have ${classData.subclasses.map((s) => s.name).join(", ")})`);
		const entry = { classData, subclass, level: LEVEL, asiChoices: p.asi || [] };
		if (p.spells) { entry.explicitCantrips = p.spells.cantrips; entry.explicitSpells = p.spells.spells; }
		if (p.style) entry.explicitFightingStyle = p.style;
		const cc = {};
		if (p.masteries) cc["Weapon Mastery"] = p.masteries;
		if (p.expertise) cc["Expertise"] = p.expertise;
		if (p.cls === "Cleric") cc["Divine Order"] = ["Protector"];
		if (p.cls === "Druid") { cc["Primal Order"] = ["Magician"]; cc["Land Type"] = ["Temperate"]; }
		if (p.cls === "Wizard") cc["Scholar"] = ["Arcana"];
		entry.classChoices = cc;
		const [kind, job] = p.role.split(" / ");   // first line is short on purpose: it is the only part that fits the box on page 1
		const notes = `Pregen: ${kind}\n${job ? job[0].toUpperCase() + job.slice(1) + ". " : ""}${p.blurb}\nPlay tips: ${p.tips.join(" ")}\nChoices made: ${p.choices}`;
		const character = ctx.kadriaBuildMulticlassCharacter({
			name: p.name, playerName: "Pregen", species: p.species, background: p.background, alignment: p.align,
			classes: [entry], abilityScores: p.scores, skillProfs: p.skills, equipmentChoiceIndices: null, weaponPicks: null,
			backgroundAbilityBonus: p.bg, explicitSpeciesSubrace: null, explicitSpeciesAbilityChoice: null, toolChoice: p.tool,
			customTraits: null, notes, allSpells: ctx.KADRIA_SPELLS, allSpecies: ctx.KADRIA_SPECIES, speciesEdition: "2024", backgroundEdition: "2024", source: "single",
		});
		const kit = KIT[p.name];
		if (kit) {
			character.equipment = kit.equipment;
			if (kit.ac) character.ac = kit.ac;
			if (kit.attacks) {
				const cantripNames = new Set((character.cantrips || []).map((s) => s.name));
				const keep = (character.attacksQuickRef || []).filter((e) => cantripNames.has(e.name));
				character.attacksQuickRef = kit.attacks.map(([name, atkBonus, damage]) => ({ name, atkBonus, damage })).concat(keep);
			}
		}
		const template = character.isSpellcaster ? ctx.KADRIA_CASTER_TEMPLATE : ctx.KADRIA_MARTIAL_TEMPLATE;
		const filled = ctx.kadriaFillTemplate(template, character);
		fs.writeFileSync(path.join(OUT, p.file + ".md"), filled.text, "utf8");

		ctx.Utilities = { base64Decode: (b64) => Array.from(Buffer.from(b64, "base64")), newBlob: (bytes, type, name) => ({ bytes, type, name, getBytes: () => bytes }) };
		ctx.Uint8Array = Uint8Array; ctx.Buffer = Buffer; ctx.TextEncoder = TextEncoder; ctx.TextDecoder = TextDecoder;
		for (const f of ["PdfLib.js", "PdfTemplates.js", "PdfFiller.js"]) vm.runInContext(fs.readFileSync(path.join(DIR, f), "utf8"), ctx, { filename: f });
		const blob = await ctx.kadriaBuildFilledPdfBlob(character, p.name + ".pdf");
		fs.writeFileSync(path.join(OUT, p.file + ".pdf"), Buffer.from(blob.getBytes ? blob.getBytes() : blob.bytes));
		const a = character.abilities || {};
		index.push({ p, character, warnings: filled.warnings || [] });
		console.log(`built ${p.file}: HP ${character.hp}, AC ${character.ac}, ${character.isSpellcaster ? "spells " + ((character.spellsKnown || character.spells || []).length || "?") : "no spells"}${(filled.warnings || []).length ? " | warnings: " + filled.warnings.join("; ") : ""}`);
	}
	return index;
}
main().catch((e) => { console.error(e); process.exit(1); });
