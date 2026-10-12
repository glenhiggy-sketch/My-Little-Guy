"""Writes vault notes for feats from the 2024 wiki: structured facts (category, prerequisite, source) plus our own short summaries.
Usage: python vault_import_feats.py <feats_parsed.json> <summaries folder with feat_sum_*.json> <vault Feats/5.5e folder>"""
import json, re, sys, os, glob

feats = json.load(open(sys.argv[1], encoding="utf8"))
sums = {}
for f in sorted(glob.glob(os.path.join(sys.argv[2], "feat_sum_*.json"))):
    sums.update(json.load(open(f, encoding="utf8")))
out = sys.argv[3]; os.makedirs(out, exist_ok=True)

def fix(s): return re.sub(r"�", "'", s).replace("Can't Have", "Can't have")
CATSLUG = {"Origin": "origin", "General": "general", "Fighting Style": "fighting-style", "Epic Boon": "epic-boon", "Dragonmark": "dragonmark",
           "Greater Dragonmark": "greater-dragonmark", "Dark Gift": "dark-gift", "Planar Pact": "planar-pact", "Greater Planar Pact": "greater-planar-pact"}
missing = [f["slug"] for f in feats if f["slug"] not in sums]
extra = [s for s in sums if s not in {f["slug"] for f in feats}]
if missing or extra: print("MISSING SUMMARIES:", missing, "UNKNOWN KEYS:", extra); sys.exit(1)
written = 0
for f in feats:
    s = sums[f["slug"]]
    pre = f["pre"]
    for n, t in f["bens"]:
        m = re.search(r"Prerequisites?:\s*([^)]*)\)", t)
        if m and not pre: pre = m.group(1)
    pre = fix(pre).strip().strip(")") or "None"
    title = fix(f["title"]).replace("Lords' Alliance", "Lords' Alliance")
    path = os.path.join(out, title.replace("/", "-") + ".md")
    if os.path.exists(path): continue
    lines = "\n".join(f"- **{k}.** {v}" for k, v in s["b"].items())
    md = f"""---
tags:
- {f['slug']}
- type/feat
- feat/{CATSLUG.get(f['cat'], 'other')}
- source/wiki
- edition/5.5e
---

# {title}
*{s['blurb']}*

**Source:** {fix(f['src'])} (imported from dnd2024.wikidot.com, 2026-10-11)

## Feat Details

| Field | Value |
|---|---|
| Category | {f['cat']} |
| Prerequisite | {pre} |

**Benefits** (summarised in our own words; check the source for exact wording)
{lines}

---
*Kadria · Hox Productions · Dungeon Master Services*
"""
    open(path, "w", encoding="utf8").write(md); written += 1
print("written", written, "of", len(feats))
