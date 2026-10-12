"""Writes vault notes for species scraped from the 2024 wiki (facts + original short trait summaries).
Usage: python vault_import_species.py <scraped.json> <species_data.json> <vault Species/5.5e folder>"""
import json, re, sys, os
S = json.load(open(sys.argv[1], encoding="utf8")); D = json.load(open(sys.argv[2], encoding="utf8")); out = sys.argv[3]
src_of = {}
for v in S.values():
    if v["kind"] == "species":
        m = re.search(r"Source:\s*(.+)", v["text"]); src_of[v["slug"]] = m.group(1).strip() if m else "unknown"
written = []
for slug, d in D.items():
    path = os.path.join(out, d["title"] + ".md")
    if os.path.exists(path): print("exists, skipped:", d["title"]); continue
    traits = "\n".join(f"- **{n}.** {t}" for n, t in d["traits"])
    md = f"""---
tags:
- {slug}
- type/species
- source/wiki
- edition/5.5e
---

# {d["title"]}
*{d["blurb"]}*

**Source:** {src_of.get(slug, "unknown")} (imported from dnd2024.wikidot.com, 2026-10-11)

## Species Traits

| Field          | Value |
| -------------- | ----- |
| Creature Type  | {d["type"]} |
| Size           | {d["size"]} |
| Speed          | {d["speed"]} |
| Ability Scores | No fixed increase \u2014 apply the Ability Score bonus from your Background instead (2024 rules). |

**Traits**
{traits}

---
*Kadria \u00b7 Hox Productions \u00b7 Dungeon Master Services*
"""
    open(path, "w", encoding="utf8").write(md); written.append(d["title"])
print("written", written)
