// Runs the real Character Intake generator (Generator.js, TemplateFiller.js, Data_*.js) in a vm, no Google, no network.
// Used to build sheets for the level 20 comparison against the wiki and to test generator changes.
//   const { build } = require("./local-build"); build({ cls: "Wizard", sub: "School of Illusion", level: 20 })
"use strict";
const vm = require("vm"), fs = require("fs"), path = require("path");
const DIR = process.env.APPSCRIPT_DIR || "B:/New folder/Second Brain.vault/_Agent-Only/code/kadria-appscript";
if (new RegExp("plugin" + " test", "i").test(DIR)) throw new Error("the plugin test vault is retired; the Intake code lives in the Kadria appscript repo");
const FILES = ["Data_Backgrounds.js", "Data_ClassResources.js", "Data_Classes.js", "Data_FeatureDetails.js", "Data_Species.js",
  "Data_SpellDetails.js", "Data_Spells.js", "Data_Templates.js", "Data_Rules2024.js", "Generator.js", "TemplateFiller.js"];

function seeded(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function load(seed = 1) {
  const M = Object.create(Math); M.random = seeded(seed);
  const ctx = vm.createContext({ console, Math: M, Logger: { log() {} } });
  for (const f of FILES) {
    const p = path.join(DIR, f);
    if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, "utf8"), ctx, { filename: f });
  }
  return ctx;
}

let ctx = null;
function build({ cls, sub, level = 20, species = "Human", background = "Soldier", seed = 1, extra = {} }) {
  ctx = load(seed);
  const classData = ctx.KADRIA_CLASSES.find((c) => c.name === cls);
  if (!classData) throw new Error("unknown class " + cls);
  const subclass = sub ? (classData.subclasses.find((s) => s.name === sub && s.edition === "2024") || classData.subclasses.find((s) => s.name === sub) || null) : null;
  if (sub && !subclass) throw new Error(`unknown subclass ${cls}: ${sub}`);
  const abilityScores = ctx.kadriaAutoAssignAbilities(ctx.kadriaRollAbilityScores("standard"), classData);
  const character = ctx.kadriaBuildMulticlassCharacter(Object.assign({
    name: "Local Test", playerName: "Local", species, background, alignment: "Neutral Good",
    classes: [{ classData, subclass, level }], abilityScores, skillProfs: null, equipmentChoiceIndices: null, weaponPicks: null,
    backgroundAbilityBonus: null, explicitSpeciesSubrace: null, explicitSpeciesAbilityChoice: null, toolChoice: null, customTraits: null,
    notes: "", allSpells: ctx.KADRIA_SPELLS, allSpecies: ctx.KADRIA_SPECIES, speciesEdition: "2024", backgroundEdition: "2024", source: "single",
  }, extra));
  const template = character.isSpellcaster ? ctx.KADRIA_CASTER_TEMPLATE : ctx.KADRIA_MARTIAL_TEMPLATE;
  const filled = ctx.kadriaFillTemplate(template, character);
  return { text: filled.text, character, warnings: filled.warnings, ctx };
}

module.exports = { build, load };
if (require.main === module) {
  const [cls, sub, level] = process.argv.slice(2);
  const r = build({ cls: cls || "Wizard", sub: sub || "School of Illusion", level: +(level || 20) });
  console.log(r.text);
}
