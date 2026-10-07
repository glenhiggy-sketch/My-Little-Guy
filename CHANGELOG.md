# Changelog

## 1.14.1
- Fix: if the My Little Guy panel was already open (it opens itself after install) and you then opened your character note, the panel showed a blank character (Class ?, HP 0) until you closed and reopened it. A note that becomes the tracked sheet is now parsed once, then pulled from the sheet. Found by the end-user simulation on the test iPhone; regression scenario `note-opened-while-panel-open`.
- Fix: if the first automatic pull fails (for example the phone's network isn't up yet right after launching the app), it is now retried a few times instead of silently leaving the character "Not synced yet". Regression scenario `first-pull-survives-a-network-blip`.
- Fix: a request to the sheet that stalls without ever answering (seen on the iPhone right after launching the app) now times out after 15 seconds and is retried, instead of leaving the character "Not synced yet" forever. The status line now says why when an automatic pull fails. Regression scenario `first-pull-survives-a-stalled-request`.

## 1.14.0
- **Sheet sync.** Character sheets made by Character Intake now carry a hidden link to the campaign Google Sheet. A new bar under the character header shows sync status with **Send to sheet** and **Get from sheet** buttons (also commands: "Send to sheet", "Get from sheet", "Restore from sheet").
  - Players own HP, AC, gold, inventory and spell slots: **Send to sheet** writes exactly those and nothing else. The DM owns party, conditions and DM notes: they only ever arrive from the sheet, and only once the DM has published them.
  - Opening a character pulls automatically. If you have unsent changes your device wins and they are never overwritten; if you don't, the sheet's saved values are restored (which also fixes HP/inventory being reset by the printed sheet when the panel reopens).
  - New **Gold** field on the Inventory page. When the DM awards gold you get a pending award with **Add to my gold** / **Already added**: the sheet never adds gold for you, you update it yourself.
  - New "Notes from your DM" block on the Notes page and a Party line in the header.
  - Offline-safe: a failed send changes nothing on your device and says so; "Restore from sheet" asks before discarding unsent changes.
  - Sheets without the hidden link behave exactly as before.
- Accessibility labels on HP, AC, Gold, item names, quantity buttons, spell-slot pips and the page arrows (screen readers, and so automated end-user testing can find them by name).

## 1.13.0
- New command, "Send test report" — testing-only, for the pre-release device-testing phase. Logs structural events only (panel opened, page viewed, dice rolled, edit saved, any caught error) with no character data, and hands a plain-text summary to the OS share sheet on mobile (same mechanism as Kadria Snapshot) or saves it into the vault on desktop. Clears its own log after a successful send.

## 1.12.0
- Pact Magic (Warlock multiclass) is now actually wired up: a new `**Pact Magic (Charisma):** Save DC N  Attack +N  Slots: LvlN []` line is parsed into its own slot pool, kept separate from a character's other spellcasting, and the Spells page shows the ability/DC/Attack text next to the pips.
- Parse-quality warnings: a sheet that clearly has an Ability Scores table but is missing the `**Class Features (X):**` / `**Species Traits (X):**` labels, or has spellcasting stats with no matching Spell Card callouts, or only `.png` card embeds with no `.md` spell embeds, now shows an explicit ⚠️ warning on the Features & Traits or Spells page naming exactly what's wrong, instead of silently rendering empty.

## 1.11.1
- No functional change. Documents and locks in that the plugin's command id (`open-my-little-guy`) is permanent, so a mobile toolbar pin survives updates, restarts, and syncs.

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
