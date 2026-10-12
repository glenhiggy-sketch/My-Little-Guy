"""Writes vault notes for backgrounds scraped from dnd2024.wikidot.com (facts only; the one-line description is original).
Usage: python vault_import_backgrounds.py <scraped.json> <blurbs.json> <vault Backgrounds/5.5e folder>"""
import json, re, sys, os

scraped = json.load(open(sys.argv[1], encoding="utf8"))
blurbs = json.load(open(sys.argv[2], encoding="utf8"))
out_dir = sys.argv[3]

def fix(s):
    # the saved pages lost the curly apostrophes and dashes (cp1252 bytes read as utf-8): put plain ones back
    s = re.sub(r"(?<=[A-Za-z])�(?=[A-Za-z])", "'", s)
    s = re.sub(r"(?<=\d)�(?=\d)", "-", s)
    return s.replace("�", "'")

LABELS = ["Source", "Ability Scores", "Ability Score", "Feat", "Skill Proficiencies", "Tool Proficiency", "Tool Proficiencies", "Equipment"]
title_fix = {"Knight Of The Gauntlet": "Knight of the Gauntlet", "Lords' Alliance Vassal": "Lords' Alliance Vassal"}
written, skipped = [], []
for key, v in scraped.items():
    if v["kind"] != "background": continue
    slug, title = v["slug"], title_fix.get(fix(v["title"]), fix(v["title"]))
    d = {}
    for line in fix(v["text"]).split("\n"):
        m = re.match(r"(%s)\s*:\s*(.*)" % "|".join(LABELS), line)
        if m and m.group(1) not in d: d[m.group(1)] = m.group(2).strip()
    ab = d.get("Ability Scores") or d.get("Ability Score") or ""
    tool = d.get("Tool Proficiency") or d.get("Tool Proficiencies") or ""
    feat = d.get("Feat", "")
    skills = d.get("Skill Proficiencies", "").replace(" and ", ", ")
    equip = d.get("Equipment", "")
    src = d.get("Source", "")
    blurb = blurbs.get(slug) or ""
    if not (ab and skills and src):
        skipped.append((slug, "missing fields: " + ", ".join(k for k, x in [("ability", ab), ("skills", skills), ("source", src)] if not x)))
        continue
    path = os.path.join(out_dir, title + ".md")
    if os.path.exists(path):
        skipped.append((slug, "already in the vault"))
        continue
    md = f"""---
tags:
- {slug}
- type/background
- source/wiki
- edition/5.5e
---

# {title}
*{blurb}*

**Source:** {src} (imported from dnd2024.wikidot.com, 2026-10-11)

## Background Traits

| Field | Value |
|---|---|
| Ability Scores | Choose {ab} — either +2 to one and +1 to another, or +1 to all three. |
| Skill Proficiencies | {skills} |
| Tool Proficiency | {tool or "none listed"} |
| Origin Feat | {feat or "not listed"} |
| Equipment | {equip or "not listed"} |

---
*Kadria · Hox Productions · Dungeon Master Services*
"""
    open(path, "w", encoding="utf8").write(md)
    written.append(title)
print("written", len(written), "skipped", skipped)
