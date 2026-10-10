# Class feature audit and level 20 simulation (2026-10-09 / 2026-10-10)

Questions this folder answers: does My Little Guy track everything on a generated character sheet, and does the character creator offer
everything the 2024 rules have? Everything here reads the real Character Intake form and the real plugin code.

## Pieces
| File | What it does |
|---|---|
| `make-chars.js` | one level-9 character per class (13) through the real form -> `chars/` |
| `make-l20.js` | one level-20 character per wiki subclass that the creator offers (76) -> `l20/` |
| `probe-form.js` | dumps what the form offers for a class/level/subclass (selects, choose-N prompts) -> `form/` |
| `wiki_features.py` | reads saved dnd2024.wikidot.com pages, lists every limited-use feature -> `wiki_limited.json` |
| `sheet_vs_wiki.py` | which wiki features a generated sheet never names -> `sheet_vs_wiki.json` |
| `parse-dump.js` | loads the plugin's real sheet parser (what it extracts from a sheet) |
| `audit.js`, `labels.js` | level 9 comparison of sheet vs parsed values |
| `use-everything.js` | presses every control on every page of every sheet, spends every tracker and spell slot, plays HP/death saves/conditions/rests, sends to the Sheet and checks it agrees; `SHARD=1/4 ... 4/4` runs in parallel, `REPORT=1` merges |
| `CREATOR-GAPS.md` | what the creator does not offer or does not write onto the sheet (belongs in Character Intake) |
| `USE-EVERYTHING-REPORT.md` | latest simulation result |

Generated sheets (`chars/`, `l20/`, `form/`) are gitignored. Test characters are `ZZSTRESS_`; remove them with the test hook's `cleanup`.
To refresh the wiki pages: download `https://dnd2024.wikidot.com/<class>:main` and each `<class>:<subclass>` page into one folder
(`p_<class>_<subclass with _>.html`) and run `wiki_features.py <folder>`.

## Results, 2026-10-10
- 76 level 20 sheets, 34,000+ control actions, 0 problems in the panel (no errors, no NaN/undefined on screen, every tracker and slot
  spends and restores correctly, Send to sheet agrees with the panel).
- Plugin gaps found and fixed in 1.15.0: limited-use class and subclass features were not tracked (0 on all sheets); hit dice could not be
  spent; exhaustion could not be raised; only gold (no copper/silver/electrum/platinum); no Heroic Inspiration.
- Creator gaps (not plugin bugs): see `CREATOR-GAPS.md`. Biggest: no subclass feature is named on any sheet (425 of 1,314 wiki features
  missing, 32%), no Epic Boon, only 12 feats, several spell counts follow 2014 rules.
- Counters deliberately not tracked: features that only spend an already tracked resource (Stunning Strike spends Focus Points, Cutting
  Words spends Bardic Inspiration), once-per-turn or at-will features, choices changed on a rest (Weapon Mastery, Hunter's Prey), and
  features without a use limit.
