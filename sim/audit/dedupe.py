"""Applies the review decisions and finds doubles: anything that appears more than once across Main (2024), Unverified-kept and
Legacy. Rule: one entry per rules element; keep the newest printing (main > 2024-format legacy > 2014), drop the older one and say
what superseded it. Also lists near-equivalents (renames, spelling) for a human to confirm; those are NOT dropped automatically.
Usage: python dedupe.py <catalog.json> <decisions_all.json> <items.json> -> manifest.json + report on stdout"""
import json, re, sys, difflib, collections

cat = json.load(open(sys.argv[1], encoding="utf8"))
dec = json.load(open(sys.argv[2], encoding="utf8"))
items = json.load(open(sys.argv[3], encoding="utf8"))
by_name = {(i["type"], i.get("parent", ""), i["name"]): i["id"] for i in items}
choice = {}
for key, iid in by_name.items():
    d = dec.get(iid)
    if d: choice[key] = d["choice"]

def norm(s, keep_paren=False):
    s = s.lower().replace("’", "'")
    if not keep_paren: s = re.sub(r"\(.*?\)", "", s)
    s = re.sub(r"school of |path of the |path of |circle of the |circle of |college of the |college of |oath of the |oath of |warrior of the |warrior of |way of the |way of | domain| patron| sorcery| magic|order of |conclave|^the ", "", s)
    return re.sub(r"[^a-z]", "", s)

ALIAS = {  # 2014 name -> 2024 name (same rules element, renamed)
    "fourelements": "elements", "draconicbloodline": "draconic", "abjurer": "abjuration", "conjurer": "conjuration", "diviner": "divination",
    "enchanter": "enchantment", "evoker": "evocation", "illusionist": "illusion", "necromancer": "necromancy", "transmuter": "transmutation",
    "bladesinging": "bladesinger", "guildartisan": "artisan", "halforc": "orc", "faerie": "fairy", "undying": "undead",
    "clocksoul": "clockwork", "clockworksoul": "clockwork", "aberrantmind": "aberrant",
}
def canon(s, kind="subclass"):
    k = norm(s, kind == "species")   # species keep their parenthetical (Mousefolk (Softpaw) is not Mousefolk (Meadowgard))
    return ALIAS.get(k, k)

PENDING = {("subclass", "Cleric", "Twilight Domain"), ("species", "", "Astral Elf"), ("species", "", "Autognome"),
           ("species", "", "Deep Gnome"), ("species", "", "Feral Tiefling"), ("species", "", "Sea Elf")}
# ---- build entries: (type, parent, name, edition, status, rank)
rows = []
ENDED = {"remove": "removed", "verify": "quarantine", "legacy": "legacy", "keep": "unverified"}
removed_classes = {k[2] for k, v in choice.items() if k[0] == "class" and v == "remove"}
kept_classes = {k[2] for k, v in choice.items() if k[0] == "class" and v == "keep"}
for s in cat["subs"]:
    key = ("subclass", s["cls"], s["name"])
    if s["cls"] in removed_classes: st, rk = "removed", 0
    elif s["cls"] in kept_classes: st, rk = "unverified", 2
    elif key in PENDING and s["edition"] != "2014": st, rk = "pending", 2
    elif key in choice and s["edition"] != "2014": st = ENDED[choice[key]]; rk = {"legacy": 2, "quarantine": 0.5, "removed": 0, "unverified": 2}[st]
    elif s["edition"] == "2014": st, rk = "legacy", 1
    else: st, rk = "main", 3          # 2024 label and matched to the wiki
    rows.append(dict(type="subclass", parent=s["cls"], name=s["name"], edition=s["edition"], status=st, rank=rk, file=s.get("file", "")))
for s in cat["species"]:
    key = ("species", "", s["name"])
    if key in PENDING and s["edition"] != "2014": st, rk = "pending", 2
    elif key in choice and s["edition"] != "2014": st = ENDED[choice[key]]; rk = {"legacy": 2, "removed": 0, "quarantine": 0.5, "unverified": 2}[st]
    elif s["edition"] == "2014": st, rk = "legacy", 1
    else: st, rk = "main", 3
    rows.append(dict(type="species", parent="", name=s["name"], edition=s["edition"], status=st, rank=rk, source=s.get("source", "")))
for b in cat["bg24"]: rows.append(dict(type="background", parent="", name=b, edition="2024", status="main", rank=3))
for b in cat["bg14"]: rows.append(dict(type="background", parent="", name=b, edition="2014", status="legacy", rank=1))

FAMILY = {("species", "Genasi"): ["Air Genasi", "Earth Genasi", "Fire Genasi", "Water Genasi"], ("species", "Gith"): ["Githyanki", "Githzerai"],
          ("species", "Yuan-ti Pureblood"): ["Yuan-ti"]}
for r in rows:
    k = (r["type"], r["name"])
    if k in FAMILY and r["edition"] == "2014" and r["status"] == "legacy":
        r["dropped"] = "superseded by newer split entries: " + ", ".join(FAMILY[k])
# ---- exact doubles (same type, same class, same canonical name)
groups = collections.defaultdict(list)
for r in rows:
    if r["status"] in ("removed",) or "dropped" in r: continue
    groups[(r["type"], r["parent"], canon(r["name"], r["type"]))].append(r)
dups = []
for g in groups.values():
    if len(g) < 2: continue
    g.sort(key=lambda r: -r["rank"])
    keep = g[0]
    for r in g[1:]:
        if r["status"] == "main" and keep["status"] == "main": continue
        r["dropped"] = "superseded by " + keep["status"] + " " + keep["edition"] + " " + keep["name"]
        dups.append((r, keep))

# ---- near equivalents across status groups (not auto-dropped)
near = []
live = [r for r in rows if r["status"] in ("main", "legacy", "unverified", "pending") and "dropped" not in r]
for i, a in enumerate(live):
    for b in live[i + 1:]:
        if a["type"] != b["type"] or a["parent"] != b["parent"] or a["status"] == b["status"]: continue
        ca, cb = canon(a["name"], a["type"]), canon(b["name"], b["type"])
        if ca == cb or len(ca) < 4 or len(cb) < 4: continue
        r = difflib.SequenceMatcher(None, ca, cb).ratio()
        if r >= 0.8 or (len(ca) > 5 and len(cb) > 5 and (ca in cb or cb in ca)): near.append((round(r, 2), a, b))

counts = collections.Counter((r["type"], r["status"]) for r in rows if "dropped" not in r)
print("AFTER DECISIONS AND DEDUPE (type, status): count")
for k, v in sorted(counts.items()): print(f"  {k[0]:10} {k[1]:11} {v}")
print(f"\nEXACT DOUBLES REMOVED FROM LEGACY ({len(dups)}):")
for r, keep in sorted(dups, key=lambda x: (x[0]["type"], x[0]["parent"], x[0]["name"])):
    print(f"  {r['type']:9} {r['parent']:9} {r['name']:34} [{r['status']} {r['edition']}]  -> {r['dropped']}")
print(f"\nPOSSIBLE EQUIVALENTS TO CONFIRM ({len(near)}):")
for rr, a, b in sorted(near, key=lambda x: (-x[0], x[1]["name"])):
    print(f"  {a['type']:9} {a['parent']:9} {a['name']} [{a['status']} {a['edition']}]  ~  {b['name']} [{b['status']} {b['edition']}]  ({rr})")
json.dump(rows, open("manifest_rows.json", "w"), indent=1)
print("FAMILY SUPERSEDED:", [r["name"] for r in rows if str(r.get("dropped", "")).startswith("superseded by newer")])
