"""Maps every content-manifest entry to a note in the Kadria vault (C:/Kadria.vault/Books) and reports what does not resolve.
Usage: python vault_registry.py [--write]   (--write also writes vault-registry.json next to this file)"""
import json, re, os, sys, glob, collections

VAULT = "C:/Kadria.vault/Books"
HERE = os.path.dirname(os.path.abspath(__file__))
man = json.load(open(os.path.join(HERE, "content-manifest.json"), encoding="utf8"))

def norm(s):
    s = s.lower().replace("’", "'")
    s = re.sub(r"\(.*?\)", "", s)
    s = re.sub(r"school of |path of the |path of |circle of the |circle of |college of the |college of |oath of the |oath of |warrior of the |warrior of |way of the |way of | domain| patron| sorcery| magic|order of |conclave|^the ", "", s)
    return re.sub(r"[^a-z]", "", s)

def head(path):
    t = open(path, encoding="utf8", errors="replace").read()
    m = re.search(r"^#\s+(.+)$", t, re.M)
    return (m.group(1).strip() if m else os.path.splitext(os.path.basename(path))[0]), t

# ---- index vault notes by (type, parent, normalised name) -> [paths]
idx = collections.defaultdict(list)
def add(kind, parent, name, path):
    idx[(kind, parent, norm(name))].append(path)
    if kind == "species": idx[(kind, parent, re.sub(r"[^a-z()]", "", name.lower()))].append(path)   # keeps "(Softpaw)" apart from "(Meadowgard)"
CLASSES = ["Artificer","Barbarian","Bard","Cleric","Druid","Fighter","Monk","Paladin","Ranger","Rogue","Sorcerer","Warlock","Wizard","Psion"]
for ed in ("5.5e", "5e", "Legacy"):
    for p in glob.glob(f"{VAULT}/{ed}/**/*.md", recursive=True):
        rel = os.path.relpath(p, VAULT).replace("\\", "/")
        base = os.path.basename(p)[:-3]
        if base.startswith("_") or base == "README": continue
        title, _ = head(p)
        for c in CLASSES:
            if base == c: add("class", "", c, rel)
            elif base.startswith(c + "-"):
                nm = title.split(":", 1)[1].strip() if ":" in title else base[len(c) + 1:]
                add("subclass", c, nm, rel)
                add("subclass", c, re.sub(r"(?<!^)(?=[A-Z])", " ", base[len(c) + 1:]), rel)  # filename form (OrderOfScribes)
# Homebrew: "<Class> Main Profile.md" is the class; the other notes in the folder are its subclasses (filename = ClassNameSubclass).
for d in glob.glob(f"{VAULT}/Homebrew/*/") + glob.glob(f"{VAULT}/Homebrew/_deprecated/*/"):
    cls = os.path.basename(os.path.normpath(d))
    if cls in ("Species", "Druid Subclasses", "_deprecated"): continue
    key = cls.replace(" ", "")
    for p in glob.glob(d + "*.md"):
        rel = os.path.relpath(p, VAULT).replace("\\", "/"); base = os.path.basename(p)[:-3]
        if base.endswith("Main Profile"): add("class", "", cls, rel); continue
        nm = title = head(p)[0]
        nm = title.split(":", 1)[1].strip() if ":" in title else re.sub(r"(?<!^)(?=[A-Z])", " ", base[len(key):] if base.startswith(key) else base)
        add("subclass", cls, nm, rel); add("subclass", cls, re.sub(r"(?<!^)(?=[A-Z])", " ", base[len(key):] if base.startswith(key) else base), rel)
for p in glob.glob(f"{VAULT}/Homebrew/Druid Subclasses/*.md") + glob.glob(f"{VAULT}/Homebrew/*.md"):
    rel = os.path.relpath(p, VAULT).replace("\\", "/"); base = os.path.basename(p)[:-3]; t = head(p)[0]
    for c in CLASSES:
        if base.startswith(c):
            nm = t.split(":", 1)[1].strip() if ":" in t else re.sub(r"(?<!^)(?=[A-Z])", " ", re.sub(r"^" + c + r"[- ]*", "", base)); add("subclass", c, nm, rel)
for p in glob.glob(f"{VAULT}/Homebrew/Species/*.md"):
    rel = os.path.relpath(p, VAULT).replace("\\", "/"); add("species", "", head(p)[0], rel); add("species", "", os.path.basename(p)[:-3], rel)
for ed in ("5.5e", "5e", "Legacy"):
    for p in glob.glob(f"{VAULT}/Species/{ed}/**/*.md", recursive=True):
        rel = os.path.relpath(p, VAULT).replace("\\", "/"); t, _ = head(p); add("species", "", t, rel); add("species", "", os.path.basename(p)[:-3], rel)
    for p in glob.glob(f"{VAULT}/Backgrounds/{ed}/**/*.md", recursive=True):
        rel = os.path.relpath(p, VAULT).replace("\\", "/"); t, _ = head(p); add("background", "", t, rel); add("background", "", os.path.basename(p)[:-3], rel)

ED = {"2024": ("5.5e", "Legacy"), "2014": ("5e", "Legacy")}
out, miss, multi = [], [], []
for e in man["entries"]:
    k = (e["type"], e.get("parent", ""), norm(e["name"]))
    cands = idx.get(k, [])
    if e["type"] == "species" and "(" in e["name"]:
        cands = idx.get((e["type"], "", re.sub(r"[^a-z()]", "", e["name"].lower())), cands)
    # prefer the folder that matches the entry's edition label, then anything
    pref = [c for c in cands if any(f"/{x}/" in "/" + c or c.startswith(x + "/") for x in ED.get(e.get("edition", ""), ()))]
    parked_first = e.get("status") in ("removed", "double")   # a superseded entry should point at the parked copy, not the live one
    pick = sorted(set(pref or cands), key=lambda c: ("Unearthed Arcana" in c, ("/_" in c) != parked_first, c))
    if not pick and e["type"] == "subclass" and e.get("parent") == "Gunslinger":
        pick = idx.get(("class", "", norm("Gunslinger")), [])
    e2 = dict(e); e2["path"] = pick[0] if pick else ""
    if len(pick) > 1: e2["alsoAt"] = pick[1:]; multi.append((e["type"], e.get("parent", ""), e["name"], pick))
    if not pick: miss.append(e)
    out.append(e2)
print("entries:", len(out), " resolved:", len(out) - len(miss), " unresolved:", len(miss), " ambiguous:", len(multi))
byst = collections.Counter((m["type"], m["status"]) for m in miss)
for k, v in sorted(byst.items()): print("  unresolved", k, v)
for m in miss[:60]: print("  -", m["type"], m.get("parent", ""), "|", m["name"], "|", m.get("edition"), "|", m["status"])
for m in multi[:15]: print("  ~", m)
used = {e["path"] for e in out if e["path"]}
allnotes = {os.path.relpath(p, VAULT).replace("\\", "/") for p in glob.glob(f"{VAULT}/5.5e/*/*.md") + glob.glob(f"{VAULT}/5e/**/*.md", recursive=True)}
orph = sorted(n for n in allnotes if n not in used and not os.path.basename(n).startswith(("_", "README")) and not n.endswith("/" + os.path.basename(n).split("-")[0] + ".md"))
print("vault notes not claimed by any manifest entry:", len(orph))
for o in orph[:50]: print("  ?", o)
if "--write" in sys.argv:
    json.dump({"entries": out, "unclaimed": orph}, open(os.path.join(HERE, "vault-registry.json"), "w", encoding="utf8"), indent=1)
