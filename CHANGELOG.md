# Changelog

## 1.11.0
- New ribbon icon: a colorful sword (steel blade, gold crossguard/pommel, wrapped grip) instead of the plain generic person icon.
- README now covers pinning "Open My Little Guy" to the mobile bottom toolbar.

## 1.10.0
- Renamed to **My Little Guy**.
- Auto-open the panel once on first vault load, and pre-seed settings so a freshly downloaded vault shows a working example immediately.

## 1.9.0
- Mobile/narrow-screen tuning: bigger touch targets, fewer grid columns, wrapping rows so nothing overflows or clips on small screens.

## 1.8.0
- Dice roller: clicking "Roll" opens a picker for any standard die (d4–d100) instead of rolling immediately.
- Roll results (freeform rolls, skill/ability/attack checks) now show as a centered overlay on the page instead of Obsidian's corner Notice.

## 1.7.0
- Session notes now save into a per-character folder (`<Character Name> Notes/`) instead of one shared folder.

## 1.6.0
- Added compact Short/Long Rest buttons directly to the top bar, next to HP and AC.

## 1.5.0
- Notes page: "+ New Session Note (Today)" creates (or reopens) a dated note in a `Session Notes` folder, with a starter template, and lists past session notes.

## 1.4.0
- Reworked the Spells page: spells grouped by level with a slot tracker per level; spell-card callouts (`![[embeds]]`) are transcluded as real cards.
- Removed the "View Character on Website" page.
- Added symbols throughout the UI; top bar now shows HP and AC together with no duplicate displays elsewhere.

## 1.3.0
- The plugin now parses hand-formatted markdown character sheets (tables, `☐`/`☑` checkboxes, bracket-style slot counters) into live frontmatter automatically on every edit, with a visible "regenerating data" loading state.

## 1.2.0
- Added a visible "Tracking: <file> — Pin this file / Unpin" bar so it's obvious which note the panel is reading, and to fix cases where it silently followed the wrong file.

## 1.1.0
- Robust multiclass support in the header and Level Up flow (`class`/`classes` in several shapes).

## 1.0.0
- Initial release: paginated widgets for Combat, Abilities/Saves/Senses, Skills, Actions, Inventory, Spells & Spell Slots, Speed & Defenses, Features & Traits, Proficiencies, Background, Notes, Creatures, Rest, and Level Up, all backed by note frontmatter.
