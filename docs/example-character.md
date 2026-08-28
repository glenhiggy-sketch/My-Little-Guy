---
character: Aria Nightbreeze
class: Wizard
subclass: Evocation
level: 5
hp: 28
hp_max: 33
temp_hp: 0
ac: 15
hit_die: 6
hit_dice_total: 5
hit_dice_used: 1
con_mod: 1
exhaustion: 0
proficiency_bonus: 3
spell_slots:
  "1":
    max: 4
    used: 1
  "2":
    max: 3
    used: 0
  "3":
    max: 2
    used: 2
spells: []
inventory:
  - name: Quarterstaff
    qty: 1
  - name: Component Pouch
    qty: 1
  - name: Rope (50ft)
    qty: 1
  - name: Potion of Healing
    qty: 2
conditions: []
features:
  - name: Arcane Recovery
    max: 1
    used: 0
    recovery: long
  - name: Wand of the War Mage Charges
    max: 2
    used: 0
    recovery: long
death_saves:
  successes: 0
  failures: 0
abilities:
  str:
    score: 9
    save_prof: false
  dex:
    score: 14
    save_prof: false
  con:
    score: 14
    save_prof: true
  int:
    score: 18
    save_prof: true
  wis:
    score: 12
    save_prof: false
  cha:
    score: 11
    save_prof: false
senses:
  passive_perception: 14
  darkvision: 0
  other: ""
skills:
  arcana:
    prof: expertise
  history:
    prof: prof
  investigation:
    prof: prof
  perception:
    prof: prof
actions:
  - name: Fire Bolt
    type: Action
    detail: Ranged Spell Attack +7 to hit, 2d10 fire damage
  - name: Shield
    type: Reaction
    detail: +5 AC until the start of your next turn
speed:
  walk: 30
  fly: 0
  swim: 0
  climb: 0
  burrow: 0
initiative_bonus: 2
defenses:
  resistances:
    - Fire
  immunities: []
  vulnerabilities: []
traits:
  - name: Skilled
    source: Species (Human, 2024)
    description: You gain proficiency in any combination of three skills or tools of your choice.
  - name: Arcane Recovery
    source: Class
    description: Once per day when you finish a short rest, recover spell slots with a combined level equal to or less than half your wizard level (round up).
proficiencies:
  armor: []
  weapons:
    - Daggers
    - Darts
    - Slings
    - Quarterstaffs
    - Light crossbows
  tools: []
  languages:
    - Common
    - Elvish
    - Draconic
background: Sage
personality_traits: I am horribly, horribly awkward in social situations.
ideals: Knowledge. The path to power and self-improvement is through knowledge.
bonds: I've been searching my whole life for the answer to a certain question.
flaws: I speak without really thinking through my words, invariably insulting others.
backstory: ""
creatures: []
notes: ""
---

# Aria Nightbreeze (Example Character)

## First time opening this vault?

1. Go to **Settings → Community plugins** and click **"Turn on community plugins"** (Obsidian always requires this one manual confirmation before any vault can run plugin code — it can't be preset for you, by design).
2. Make sure **My Little Guy** is toggled on in that same list.
3. Reload Obsidian once (Cmd/Ctrl+P → "Reload app without saving"). The My Little Guy panel will open automatically, already showing this example character.

From there, everything is live: click through the pages with the ‹ › arrows, try Short/Long Rest, level up, roll some dice.

## Making it yours

- This note is just a demo. Duplicate it (or make a new note) for your own character, using the same frontmatter fields as a template.
- If your character sheet is a hand-written table/checkbox format instead of frontmatter, open it and the plugin will parse it into frontmatter automatically on every edit — no setup needed.
- In the panel, click **Pin this file** while your own character note is open to lock the panel onto it (instead of the demo). **Unpin** to have it follow whichever note you have active.
- Everything the panel shows — HP, AC, inventory, spells, spell slots, skills, level, proficiency — lives in this note's YAML frontmatter. Editing it through the widgets rewrites the frontmatter automatically; you can also edit the YAML by hand and the panel picks up the change.
