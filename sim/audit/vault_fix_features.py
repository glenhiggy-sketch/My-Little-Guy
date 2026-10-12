"""Brings Kadria vault subclass notes in line with the 2024 wiki where the vault carried older or approximate feature lists
("the vault is the source; where it differs from the wiki, change the vault"). Each note's feature table and feature sections are
rewritten with our own short wording; sections marked KEEP carry over the vault's existing text. Idempotent. Dry run by default.
Usage: python vault_fix_features.py [--apply]"""
import re, sys, os

V = "C:/Kadria.vault/Books/"
APPLY = "--apply" in sys.argv
KEEP = None

FIXES = {
 "5.5e/Wizard/Wizard-Conjurer.md": ("Wizard", "Conjurer", [
  (3, "Conjuration Savant", "Add two Conjuration spells of level 2 or lower to your spellbook for free, and one more each time you gain a new spell slot level."),
  (3, "Benign Transposition", "Bonus action: teleport up to 30 feet, or swap places with a willing Medium or smaller creature. Uses equal to your Intelligence modifier (minimum 1) per Long Rest."),
  (6, "Distant Transposition", "Benign Transposition reaches 60 feet, and you can regain a use by spending a level 3 or higher spell slot."),
  (6, "Durable Summons", "Creatures you summon or create with a Conjuration spell slot gain temporary hit points equal to twice your Wizard level and resist most damage types while they last."),
  (10, "Focused Conjuration", "Taking damage can't break your Concentration on Conjuration spells."),
  (14, "Splintered Summons", "When a Conjuration spell summons one creature from a stat block, you can summon two instead (each with half hit points). Once per Long Rest, or spend a level 5+ slot to reuse it."),
 ]),
 "5.5e/Wizard/Wizard-Enchanter.md": ("Wizard", "Enchanter", [
  (3, "Enchanting Conversationalist", "Gain proficiency in Deception, Intimidation or Persuasion (your choice) and add your Intelligence modifier (minimum +1) to checks with it."),
  (3, "Enchantment Savant", "Add two Enchantment spells of level 2 or lower to your spellbook for free, and one more each time you gain a new spell slot level."),
  (3, "Hypnotic Presence", "Magic action: a creature within 10 feet that can see or hear you makes a Wisdom save against your spell save DC or is Charmed for a minute, or until you move away or harm it."),
  (6, "Split Enchantment", "When you cast an Enchantment spell that gains an extra target at a higher level, you can raise its effective level by 1. Uses equal to your Intelligence modifier per Long Rest."),
  (10, "Instinctive Charm", "Reaction when a creature within 30 feet hits you: it makes a Wisdom save or the attack misses and may be redirected to another creature in range."),
  (14, "Alter Memories", "Creatures Charmed by your Enchantment spells can stay unaware of it, and you can later force an Intelligence save to rewrite their memory of the charm."),
 ]),
 "5.5e/Wizard/Wizard-Necromancer.md": ("Wizard", "Necromancer", [
  (3, "Necromancy Savant", "Add two Necromancy spells of level 2 or lower to your spellbook for free, and one more each time you gain a new spell slot level."),
  (3, "Necromancy Spellbook", "While your spellbook is in hand you resist necrotic damage and your familiar can take a Skeleton or Zombie form."),
  (6, "Grave Power", "Arcane Recovery also reduces your exhaustion by 1, and your Wizard damage ignores resistance to necrotic."),
  (6, "Undead Thralls", "Animate Dead is always prepared and castable once per Long Rest without a slot, at one level higher. Your raised undead gain extra hit points and deal extra necrotic damage."),
  (10, "Harvest Undead", "When you are Bloodied but not dropped, use your reaction to reduce one of your undead to 0 hit points and regain hit points equal to your Wizard level."),
  (14, "Death's Master", "With your spellbook in hand: bonus action to give your undead temporary hit points equal to your Wizard level, and make a fallen undead explode in necrotic energy."),
 ]),
 "5.5e/Wizard/Wizard-Transmuter.md": ("Wizard", "Transmuter", [
  (3, "Transmutation Savant", "Add two Transmutation spells of level 2 or lower to your spellbook for free, and one more each time you gain a new spell slot level."),
  (3, "Transmuter's Stone", "After a Long Rest, create a stone that serves as your focus and grants its bearer Constitution save proficiency plus one benefit: Darkvision, a damage resistance, or +10 feet Speed."),
  (3, "Wondrous Alteration", "Alter Self is always prepared and castable once per Long Rest without a slot, with an extra benefit for each of its options."),
  (6, "Empowered Transmutation", "When you cast a Transmutation spell that has no attack roll or save, you can raise its effective level by 1. Uses equal to your Intelligence modifier per Long Rest."),
  (10, "Potent Stone", "Your stone grants two benefits at once and gains new options. You can change them when you cast a Transmutation spell."),
  (10, "Shape-Shifter", "Polymorph is always prepared and castable once per Long Rest without a slot, with extra benefits when you target yourself."),
  (14, "Master Transmuter", "Magic action: consume your stone for a one-off powerful effect. You can avoid destroying it by spending a level 7+ spell slot."),
 ]),
 "5.5e/Monk/Monk-WarriorOfTheMysticArts.md": ("Monk", "Warrior of the Mystic Arts", [
  (3, "Spellcasting", "You know two Sorcerer cantrips and prepare Sorcerer spells using Wisdom; your slots and prepared spells grow with Monk level, and you gain a third cantrip at level 10."),
  (6, "Mystic Fighting Style", "When you take the Attack action, you can replace one Unarmed Strike with a Sorcerer cantrip that takes an action to cast."),
  (6, "Mystic Focus", "Spend a spell slot to regain Focus Points equal to its level; after a Short Rest or Uncanny Metabolism, spend Focus Points to recover a spell slot of level 1 to 4."),
  (11, "Focused Strike", "A creature targeted by your Stunning Strike has disadvantage on saves against your spells until the start of your next turn."),
  (17, "Improved Mystic Fighting Style", "With Flurry of Blows, replace two Unarmed Strikes with a level 1 or 2 Sorcerer spell that takes an action, cast as part of the same bonus action."),
 ]),
 "5.5e/Fighter/Fighter-ArcaneArcher.md": ("Fighter", "Arcane Archer", [
  (3, "Arcane Archer Lore", "Know Druidcraft or Prestidigitation (Intelligence) and gain proficiency in Arcana and Nature."),
  (3, "Arcane Shot", "Learn two Arcane Shot options (more at levels 7, 10, 15 and 18). Once per turn, apply one to a ranged ammunition attack. Uses equal to your Intelligence modifier per Short or Long Rest."),
  (7, "Curving Shot", "When a ranged ammunition attack misses, use a bonus action to redirect it to a new target within 60 feet of the original."),
  (7, "Magical Ammunition", "Magic action: imbue a piece of ammunition with a magical effect and fire it at a surface to trigger it. Once per Short or Long Rest, or spend a Second Wind use."),
  (10, "Ever-Ready Shot", "When you roll Initiative, regain one expended use of Arcane Shot."),
  (15, "Indomitable Teleport", "When you succeed on a save with Indomitable, you can teleport up to 60 feet to a space you can see."),
  (18, "Masterful Shots", "When a creature you can see misses you, use your reaction to move up to half your Speed without provoking and make a ranged attack against it."),
 ]),
 "5.5e/Warlock/Warlock-VestigePatron.md": ("Warlock", "Vestige", [
  (3, "Vestige Companion", "A Celestial, Fiend or Undead vestige fights beside you, acting on your turn (it Dodges unless you command it). It vanishes if you die."),
  (3, "Vestige Spells", "Pick the Life, Light, Trickery or War Cleric domain; its domain spells become Warlock spells you always have prepared as you reach the listed levels."),
  (6, "Vestige Power", "Your vestige regains its Divine Power after any rest or when you use Magical Cunning, and you share its damage resistances while within 30 feet."),
  (10, "Vestige Recovery", "When your vestige would drop to 0 hit points, spend a Pact Magic slot to restore it to full and teleport it. Once per Long Rest."),
  (14, "Semblance of Life", "Magic action: your vestige takes a powerful form for 1 hour (Celestial, Fiend or Undead spirit)."),
 ]),
 "5.5e/Cleric/Cleric-Arcana.md": ("Cleric", "Arcana Domain", [
  (3, "Arcana Domain Spells", KEEP),
  (3, "Modify Magic", "Spend a Channel Divinity use as you cast a spell to give a target 2d8 plus your Cleric level temporary hit points, or to subtract 1d6 from a target's first save against it."),
  (3, "Student of Arcana", "Proficiency in Arcana (or a first-level Cleric skill) and two Wizard cantrips you can swap on gaining a Cleric level."),
  (6, "Dispelling Recovery", "After a spell that heals or ends a condition, cast Dispel Magic as part of the same action without a slot. Once per Long Rest."),
  (17, "Magical Mastery", "Learn four Wizard spells, one each of levels 6 to 9, and always have them prepared; swap one when you gain a Cleric level."),
 ]),
}

# small renames in the middle of otherwise correct notes: (path, old heading text, new heading text, table old, table new)
RENAMES = [
 ("5.5e/Rogue/Rogue-Assassin.md", "Bonus Proficiencies", "Assassin's Tools", "Bonus Proficiencies", "Assassin's Tools"),
 ("5.5e/Bard/Bard-Valor.md", "Martial Weapon Proficiency", "Martial Training", "Martial Weapon Proficiency", "Martial Training"),
 ("5.5e/Artificer/Artificer-Reanimator.md", "Reanimator's Tools", "Reanimator's Skill Set", "Reanimator's Tools", "Reanimator's Skill Set"),
 ("5.5e/Sorcerer/Sorcerer-Clockwork.md", "Clockwork Magic", "Clockwork Spells", "Clockwork Magic", "Clockwork Spells"),
 ("5.5e/Monk/Monk.md", "Focus", "Monk's Focus", None, None),
]
ORD = {1: "1st", 2: "2nd", 3: "3rd"}
def ordinal(n): return ORD.get(n, f"{n}th") if n not in (11, 12, 13) else f"{n}th"


def rewrite(text, short, feats):
    old = {m.group(1).strip(): m.group(2).strip() for m in re.finditer(r"^###\s+(.+?)\s*\([^)]*\)\s*\n(.*?)(?=^#{1,3}\s|\Z)", text, re.S | re.M)}
    lines = text.split("\n")
    start = next(i for i, l in enumerate(lines) if re.match(r"^##\s+.*Features", l) and not l.startswith("## Class"))
    end = next((i for i in range(start + 1, len(lines)) if re.match(r"^##\s", lines[i])), len(lines))
    by_level = {}
    for lv, n, _ in feats: by_level.setdefault(lv, []).append(n)
    cls = re.search(r"^# (\w+):", text, re.M).group(1)
    new = [f"## {short} Features", "", f"| {cls} Level | Feature |", "|---|---|"]
    new += [f"| {lv} | {', '.join(ns)} |" for lv, ns in sorted(by_level.items())]
    new.append("")
    for lv, n, t in feats:
        body = old.get(n) if t is KEEP else t
        if body is None: raise SystemExit(f"no existing text to keep for {n}")
        new += [f"### {n} ({ordinal(lv)} Level)", body, ""]
    return "\n".join(lines[:start] + new + lines[end:])


changed = 0
for path, (cls, short, feats) in FIXES.items():
    p = V + path
    t = open(p, encoding="utf8").read(); nl = "\r\n" if "\r\n" in t else "\n"
    u = rewrite(t.replace("\r\n", "\n"), short, feats)
    u = re.sub(r"^\*\*Status:\*\*[^\n]*", lambda m: m.group(0), u, flags=re.M)
    if u != t.replace("\r\n", "\n"):
        changed += 1
        print(("rewrote " if APPLY else "would rewrite ") + path)
        if APPLY: open(p, "w", encoding="utf8", newline="").write(u.replace("\n", nl))
for path, oh, nh, ot, nt in RENAMES:
    p = V + path
    t = open(p, encoding="utf8").read()
    u = re.sub(r"^(###\s+)" + re.escape(oh) + r"(\s*\()", lambda m: m.group(1) + nh + m.group(2), t, flags=re.M)
    if ot: u = u.replace("| " + ot, "| " + nt).replace(", " + ot, ", " + nt)
    else: u = re.sub(r"(\|\s*\d+\s*\|\s*(?:[^|\n]*,\s*)?)" + re.escape(oh) + r"(?=\s*(?:,|\|))", lambda m: m.group(1) + nh, u)   # a whole feature name only
    if u != t:
        changed += 1
        print(("renamed in " if APPLY else "would rename in ") + path)
        if APPLY: open(p, "w", encoding="utf8", newline="").write(u)

# Fighter: Extra Attack at 5, 11, 20 becomes three named features (the 2024 names)
p = V + "5.5e/Fighter/Fighter.md"
t = open(p, encoding="utf8").read()
if "Two Extra Attacks" not in t:
    u = re.sub(r"^### Extra Attack \(5th, 11th, 20th Level\)\s*\n(.*?)(?=^#{1,3}\s)",
               "### Extra Attack (5th Level)\nYou can attack twice, instead of once, whenever you take the Attack action on your turn.\n\n"
               "### Two Extra Attacks (11th Level)\nYou can attack three times, instead of once, whenever you take the Attack action on your turn.\n\n"
               "### Three Extra Attacks (20th Level)\nYou can attack four times, instead of once, whenever you take the Attack action on your turn.\n\n", t, flags=re.S | re.M)
    u = re.sub(r"^(\|\s*11\s*\|[^\n]*?)Extra Attack", r"\1Two Extra Attacks", u, flags=re.M)
    u = re.sub(r"^(\|\s*20\s*\|[^\n]*?)Extra Attack", r"\1Three Extra Attacks", u, flags=re.M)
    if u != t:
        changed += 1
        print(("rewrote " if APPLY else "would rewrite ") + "5.5e/Fighter/Fighter.md (Extra Attack names)")
        if APPLY: open(p, "w", encoding="utf8", newline="").write(u)
print(f"{changed} notes {'changed' if APPLY else 'would change'}")
