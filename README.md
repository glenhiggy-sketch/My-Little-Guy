# My Little Guy

A live, paginated character sheet panel for Obsidian. Point it at a character note and it gives you Combat, Abilities/Saves/Senses, Skills, Actions, Inventory, Spells & Spell Slots, Speed & Defenses, Features & Traits, Proficiencies, Background, Notes, Creatures, Rest, and Level Up — all editable, all backed by the note's own YAML frontmatter.

If your character sheet is a hand-formatted markdown document (tables, `☐`/`☑` checkboxes, bracket-style spell slot boxes) instead of frontmatter, the plugin parses it into live frontmatter automatically, every time you edit the note.

## Features

- **⚔️ Combat** — HP/Temp HP with quick Damage/Heal buttons, death saves, a conditions grid, and a class-features-with-limited-uses tracker.
- - **💪 Abilities, Saves & Senses** — six ability scores with live modifiers, save-proficiency toggles, passive perception/darkvision, and a 🎲 roll button on every check and save.
  - - **🎯 Skills** — all 18 skills with a proficiency selector (none/half/proficient/expertise), computed totals, and roll buttons.
    - - **🗡️ Actions** — add/edit attacks and abilities; roll buttons auto-detect an attack bonus (`+N to hit`) or damage dice (`NdM+K`) parsed straight out of the detail text.
      - - **🎒 Inventory** — add/remove items with quantity steppers.
        - - **🔮 Spells & Spell Slots** — spells grouped by level with per-level slot trackers; where your sheet uses spell-card callouts with `![[embeds]]`, the actual linked spell notes are transcluded as cards.
          - - **🏃 Speed & Defenses** — walk/fly/swim/climb/burrow speeds, initiative, and resistance/immunity/vulnerability tag editors.
            - - **⭐ Features & Traits**, **📜 Proficiencies**, **📖 Background**, **📝 Notes** (with dated, per-character session-note folders), **🐾 Creatures** (companions/summons).
              - - **🌙 Rest** — Short/Long Rest buttons that reset the right resources (including anything tagged with a `recovery` field), plus compact Short/Long buttons live in the top bar.
                - - **⬆️ Level Up** — HP roll + CON mod prompt, recalculates proficiency bonus, flags Ability Score Improvement milestone levels, supports multiclass.
                  - - **🎲 Dice roller** — a formula field in the top bar (`1d20+5`, `2d6`, etc.) opens a picker for any standard die; every roll result shows as a centered overlay, not a corner toast.
                    - - **Auto-sync from hand-written sheets** — parses markdown tables/checkboxes into frontmatter on every edit, so a hand-formatted sheet and the live widgets stay in sync automatically.
                     
                      - ## Installation
                     
                      - ### On desktop (or if you can drop files directly into the vault)
                     
                      - 1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/glenhiggy-sketch/My-Little-Guy/releases/latest).
                        2. 2. Create a folder named `my-little-guy` inside your vault's `.obsidian/plugins/` folder.
                           3. 3. Place the three files inside it.
                              4. 4. In Obsidian, go to **Settings → Community plugins**, reload the plugin list, and enable **My Little Guy**.
                                
                                 5. ### On mobile (iOS/Android), or anywhere you can't easily reach `.obsidian/`
                                
                                 6. iOS in particular hides the `.obsidian` folder from Files app by default, which makes copying plugin files in manually unreliable. Use **[BRAT](https://github.com/TfTHacker/obsidian42-brat)** instead — it installs plugins over the network, from inside Obsidian itself, so it never touches the filesystem directly:
                                
                                 7. 1. Install **BRAT** from **Settings → Community plugins → Browse** (it's an official, listed plugin — this step works normally on any platform).
                                    2. 2. Open BRAT's settings and tap **"Add Beta Plugin"**.
                                       3. 3. Enter this repository: `glenhiggy-sketch/My-Little-Guy`
                                          4. 4. BRAT downloads and installs My Little Guy directly. Enable it in **Settings → Community plugins** if it isn't already.
                                             5. 5. BRAT will also check this repo for updates going forward.
                                               
                                                6. ## Usage
                                               
                                                7. 1. Open a character note (or use the plugin's Settings tab to point it at one — the top bar shows a **"Pin this file"** button too).
                                                   2. 2. Click the person icon in the ribbon, or run **"Open My Little Guy"** from the command palette. It opens as its own full tab.
                                                      3. 3. First run: if the note has no frontmatter yet but has a recognizable table/checkbox format, the plugin generates frontmatter for it automatically.
                                                        
                                                         4. ### Frontmatter schema
                                                        
                                                         5. The plugin reads/writes a specific set of frontmatter keys. A fully worked example is worth more than a table here — see [`docs/example-character.md`](docs/example-character.md) for a complete reference covering every field the plugin understands (abilities, skills, spell slots, inventory, actions, traits, proficiencies, resources, and so on).
                                                        
                                                         6. ## Notes on the auto-sync behavior
                                                        
                                                         7. If your sheet is a hand-formatted markdown document rather than pure frontmatter, the plugin re-parses the body into frontmatter **every time the note changes** — including edits made through the widgets themselves (which write to frontmatter, triggering the same re-parse). This means the printed markdown sheet is the source of truth: anything you change only through the widgets (HP, spell slots used, conditions, etc.) will revert to whatever the printed sheet says the next time you edit anything else in that note. Session-only fields with no equivalent in the printed sheet (`notes`, `session_notes`, `creatures`, `death_saves`, tracked-use `features`) are never touched by the auto-parser, so they persist safely.
                                                        
                                                         8. ## License
                                                        
                                                         9. MIT — see [LICENSE](LICENSE).
                                                         10. 
