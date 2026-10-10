# Character creator gaps (found by the level 20 simulation, 2026-10-10)

How this was produced: 76 level 20 characters were built through the real Character Intake form (one per class and subclass that
dnd2024.wikidot.com lists and the creator offers), then each generated sheet was compared with the wiki's class and subclass pages
(`wiki_features.py`, `sheet_vs_wiki.py`, `probe-form.js`, `subclass_compare.json`). Nothing here is a My Little Guy bug: this is what the
creator does not offer or does not write onto the sheet. Fixing it belongs in the Character Intake project (Apps Script).

## 1. What the sheet does not say (biggest gap)
- **No subclass feature is named.** Every sheet lists a generic `<Class>: Subclass Feature` instead of the real features (for example a
  Path of the Zealot barbarian never sees Divine Fury, Warrior of the Gods, Fanatical Focus, Zealous Presence or Rage of the Gods).
  Across the 76 sheets the wiki lists 1,314 class+subclass features (levels 1-20, base class counted once per sheet) and **425 (32%) are not
  named anywhere on the sheet**. Worst: Wizard 44%, Warlock 43%, Fighter 42%, Sorcerer 39%, Artificer 37%. Per sheet: `sheet_vs_wiki.json`.
- Some base-class features are also absent on the Artificer sheets (Tools of the Trade, Extra Attack, ...).
- Class features are names only. There is no description text for any class or subclass feature (species traits do have descriptions),
  so a player cannot read what a feature does from the sheet or from My Little Guy.
- Only 4 features carry a use count in the sheet text (Fighter: Action Surge, Indomitable; Cleric: Channel Divinity twice, all as "(N/rest)").
  Every other limited-use feature has no count, so My Little Guy now works the counts out itself (1.15.0, `classTrackers`).

## 2. Choices the creator never asks for (level 20 build)
- **Epic Boon at level 19**: not offered for any class (ASIs appear at 4, 8, 12, 16; Fighter also 6, 14; Rogue also 10).
- **Feats**: the picker has 12 entries (the 10 Origin feats, Magic Initiate as three entries). No General feats (Great Weapon Master,
  Sentinel, War Caster, Sharpshooter, Resilient, ...), no Fighting Style feats, no Epic Boons. The 2024 PHB has roughly 75 feats.
- **Weapon Mastery** weapon picks (Barbarian 4, Fighter 6 at level 20, plus Paladin/Ranger/Rogue): never asked.
- **Fighting Style / Expertise / Divine Order / Primal Order / Hunter's Prey / Draconic Ancestry / Land type**: never asked (the sheet
  just picks one, e.g. "Fighting Style - Interception").
- **Mystic Arcanum** spell picks (Warlock 11/13/15/17) and **Signature Spells** (Wizard 20): not offered.
- (Checked and fine: Battle Master maneuvers are offered, 9 at level 20 like the wiki, and the sheet lists them. Same for Sorcerer
  metamagic and Warlock invocations.)
- ASI mode "Auto" picks the primary ability; there is no per-score choice besides "+2 to one"/"+1 to two" without saying which.

## 3. Numbers that follow the 2014 rules instead of the 2024 tables
| Class (level 20) | Creator asks for | 2024 wiki table |
|---|---|---|
| Cleric prepared spells | 20 | 22 |
| Druid prepared spells | 20 | 22 |
| Paladin prepared spells | 9 | 15 |
| Ranger prepared spells | 10 | 15 |
| Sorcerer spells | 16 | 22 |
| Wizard prepared spells | 21 | 25 (spellbook 44) |
| Artificer prepared spells | 11 | 15 |
| Artificer infusions / plans | 12 | 8 plans known |
Matching: Bard 22, Warlock 15 spells / 10 invocations, Sorcerer 6 cantrips and 6 metamagic, all cantrip counts, all slot tables.
The spell pick lists also contain 2014-only spells (for example Acid Arrow, Arcanist's Magic Aura).

## 4. Option lists
- **Subclass dropdown repeats names**: 2014 and 2024 versions sit in the same list with the same label (e.g. "School of Abjuration" twice,
  "Arcane Archer" twice), so a player cannot tell which rules they get. Homebrew entries (Fighter: Gladiator, Hell Knight; Psion,
  Gunslinger, Blood Hunter, Illrigger, ... as whole classes) share the list with PHB options.
- **Missing from the creator but on the wiki**: Fighter - Sorrow Knight. (Every other wiki subclass is offered.)
- Species and background lists also repeat names across the 2014 and 2024 versions (Aarakocra, Acolyte, Charlatan, ... twice).

## 5. Not tested here
Multiclass builds (Add Another Class), point buy and rolled ability scores, levels other than 9 and 20, the Drive/PDF output.
