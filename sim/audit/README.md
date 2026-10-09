# Class feature audit (2026-10-09)

`make-chars.js` builds one level-9 character per class (13) through the real Character Intake form; `audit.js` compares each generated
sheet with what the plugin extracts (`parse-dump.js` loads the real parser). Generated sheets go to `sim/audit/chars/` (gitignored); clean up
the ZZSTRESS_ test characters afterwards with the test hook's `cleanup`.

## What passed (all 13 classes)
Class feature names, species traits, attacks, equipment, spell lists (incl. cantrips), spell slots, Pact Magic slots/DC/attack, saves, skills,
speed, senses, conditions, exhaustion: all appear in the plugin.

## Gaps found
1. **Limited-use features were not tracked at all** (0 trackers on all 13). The sheets give use counts for only 4 features (Fighter: Action Surge,
   Indomitable; Cleric: Channel Divinity x2, all as "(N/rest)"). Fixed in 1.15.0: the plugin now fills the existing tracker from a rules table
   (`classTrackers` in main.js) the first time a sheet is read, plus a button for existing characters.
2. **Character Intake names no subclass features**: 12 of 13 sheets list a generic "<Class>: Subclass Feature" instead of the real feature
   (e.g. an Ancestral Guardian's Ancestral Protectors). The plugin can only show what the sheet says. Fix belongs in Character Intake's class data.
3. Class features are names only (no descriptions) in one long line; species traits do have descriptions.
4. Not tracked by design: subclass resources (other than Battle Master dice), feat uses, Heroic Inspiration, item charges, Warlock Mystic Arcanum.
