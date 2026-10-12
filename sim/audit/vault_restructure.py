"""Restructures C:/Kadria.vault/Books so the folders say what the content is, using vault-registry.json (see vault_registry.py).
  main        stays in Books/5.5e/<Class>, Species/5.5e, Backgrounds/5.5e (what the creator shows by default)
  unverified  stays where it is (Homebrew), stamped
  legacy      -> Books/Legacy/<Class>/, Species/Legacy/, Backgrounds/Legacy/   (the Legacy toggle reads these)
  pending     -> <dir>/_pending/       quarantine -> <dir>/_quarantine/       removed, double -> <dir>/_deprecated/
Every note it touches gets `kadria-status` and `kadria-edition` frontmatter. Nothing is deleted; a move log is written for undo.
Usage: python vault_restructure.py            (dry run, prints the plan)
       python vault_restructure.py --apply    (backs up Books first, then moves, rewrites relative links, stamps)"""
import json, os, re, sys, shutil, zipfile, collections, urllib.parse, datetime

VAULT = "C:/Kadria.vault/Books"
HERE = os.path.dirname(os.path.abspath(__file__))
APPLY = "--apply" in sys.argv
reg = json.load(open(os.path.join(HERE, "vault-registry.json"), encoding="utf8"))["entries"]
STRENGTH = ["main", "unverified", "legacy", "pending", "quarantine", "removed", "double"]   # a note claimed twice keeps the strongest

# ---- decide a status per note (and per removed class folder)
status, edition, parent_of, kind_of = {}, {}, {}, {}
removed_dirs = []
for e in reg:
    p = e.get("path")
    if e["type"] == "class" and e["status"] == "removed":
        d = os.path.dirname(p) if p else ""
        if d and d not in ("5.5e", "5e", "Homebrew") and os.path.isdir(f"{VAULT}/{d}"): removed_dirs.append(d)
    if not p: continue
    if p not in status or STRENGTH.index(e["status"]) < STRENGTH.index(status[p]):
        status[p] = e["status"]; edition[p] = e.get("edition", ""); parent_of[p] = e.get("parent", ""); kind_of[p] = e["type"]
removed_dirs = sorted(set(removed_dirs))

def in_removed_dir(p): return any(p.startswith(d + "/") for d in removed_dirs)

# ---- destinations
moves = {}   # old rel -> new rel
for d in removed_dirs:   # whole class folder, e.g. Homebrew/Illrigger -> Homebrew/_deprecated/Illrigger
    base = os.path.basename(d); top = os.path.dirname(d)
    for root, _, files in os.walk(f"{VAULT}/{d}"):
        for f in files:
            old = os.path.relpath(os.path.join(root, f), VAULT).replace("\\", "/")
            moves[old] = f"{top}/_deprecated/{base}/" + os.path.relpath(os.path.join(root, f), f"{VAULT}/{d}").replace("\\", "/")

for p, st in status.items():
    if in_removed_dir(p) or st in ("main", "unverified"): continue
    parts = p.split("/"); name = parts[-1]; folder = "/".join(parts[:-1])
    if any(x.startswith("_") for x in parts[:-1]): continue          # already parked in _deprecated / _to_delete
    if st == "legacy":
        k = kind_of[p]
        if k == "subclass": new = f"Legacy/{parent_of[p]}/{name}"
        elif k == "species": new = f"Species/Legacy/{name}"
        elif k == "background": new = f"Backgrounds/Legacy/{name}"
        else: continue
    else:
        new = f"{folder}/_{'deprecated' if st in ('removed', 'double') else st}/{name}"
    if new != p: moves[p] = new

# 2014 subclass notes that moved to Legacy but live in the Unearthed Arcana folder keep their folder name out of the way.
dest_count = collections.Counter(moves.values())
clash = {d: n for d, n in dest_count.items() if n > 1 or os.path.exists(f"{VAULT}/{d}")}
print(f"notes with a status: {len(status)}   moves planned: {len(moves)}   removed class folders: {removed_dirs}")
by = collections.Counter(re.sub(r"[^/]+$", "", d) .split("/")[0] + "/" + ("_deprecated" if "_deprecated" in d else "_pending" if "_pending" in d else "_quarantine" if "_quarantine" in d else "") for d in moves.values())
for k, v in sorted(by.items()): print("  ->", k, v)
if clash:
    print("DESTINATION CLASHES:"); [print("  ", d, n) for d, n in clash.items()]
    sys.exit(1)
if not APPLY:
    for o, n in list(moves.items())[:12]: print("  e.g.", o, "->", n)
    print("dry run: pass --apply to perform"); sys.exit(0)

# ---- backup, then move
stamp = datetime.date.today().isoformat()
bk = f"B:/New folder/Kadria Archive Sandbox/books-before-restructure-{stamp}.zip"
if not os.path.exists(bk):
    with zipfile.ZipFile(bk, "w", zipfile.ZIP_DEFLATED) as z:
        for sub in ("5.5e", "5e", "Species", "Backgrounds", "Homebrew", "Feats"):
            for root, _, files in os.walk(f"{VAULT}/{sub}"):
                for f in files: z.write(os.path.join(root, f), os.path.relpath(os.path.join(root, f), VAULT))
    print("backup:", bk)

inv = {v: k for k, v in moves.items()}
def resolve_old(path):   # where a note lived before the move
    return inv.get(path, path)
for old, new in moves.items():
    os.makedirs(os.path.dirname(f"{VAULT}/{new}"), exist_ok=True)
    shutil.move(f"{VAULT}/{old}", f"{VAULT}/{new}")
for d in removed_dirs:   # leave no empty husks
    for root, dirs, files in os.walk(f"{VAULT}/{d}", topdown=False):
        if not os.listdir(root): os.rmdir(root)

# ---- rewrite relative .md links that pointed at a moved note
LINK = re.compile(r"\]\(([^)#\s][^)#]*?\.md)(#[^)]*)?\)")
def fix_links(abs_path, new_rel):
    t = open(abs_path, encoding="utf8", errors="surrogateescape", newline="").read()
    old_dir = os.path.dirname(resolve_old(new_rel))
    def sub(m):
        target = urllib.parse.unquote(m.group(1))
        if re.match(r"[a-z]+:", target): return m.group(0)
        tgt_old = os.path.normpath(os.path.join(old_dir, target)).replace("\\", "/")
        tgt_new = moves.get(tgt_old, tgt_old)
        rel = os.path.relpath(tgt_new, os.path.dirname(new_rel)).replace("\\", "/")
        return m.group(0) if rel == target else "](" + urllib.parse.quote(rel, safe="/()'") .replace("%20", "%20") + (m.group(2) or "") + ")"
    u = LINK.sub(sub, t)
    if u != t: open(abs_path, "w", encoding="utf8", errors="surrogateescape", newline="").write(u); return 1
    return 0
relinked = 0
for root, _, files in os.walk(VAULT):
    for f in files:
        if f.endswith(".md"):
            ap = os.path.join(root, f); rel = os.path.relpath(ap, VAULT).replace("\\", "/")
            relinked += fix_links(ap, rel)

# ---- stamp frontmatter
def stamp_note(rel, st, ed):
    ap = f"{VAULT}/{rel}"
    t = open(ap, encoding="utf8", errors="surrogateescape", newline="").read()
    nl = "\r\n" if "\r\n" in t else "\n"
    add = [f"kadria-status: {st}"] + ([f"kadria-edition: {ed}"] if ed else [])
    m = re.match(r"---\r?\n(.*?)\r?\n---", t, re.S)
    if m:
        body = re.sub(r"^kadria-(status|edition):.*\r?\n?", "", m.group(1), flags=re.M).rstrip("\r\n")
        t2 = "---" + nl + body + nl + nl.join(add) + nl + "---" + t[m.end():]
    else:
        t2 = "---" + nl + nl.join(add) + nl + "---" + nl + nl + t
    if t2 != t: open(ap, "w", encoding="utf8", errors="surrogateescape", newline="").write(t2); return 1
    return 0
stamped = 0
for p, st in status.items():
    new = moves.get(p, p)
    if os.path.exists(f"{VAULT}/{new}"): stamped += stamp_note(new, st, edition.get(p, ""))
for old, new in moves.items():   # notes in removed class folders that no entry claimed
    if old not in status and in_removed_dir(old) is False and False: pass
for d in removed_dirs:
    for root, _, files in os.walk(f"{VAULT}/{os.path.dirname(d)}/_deprecated/{os.path.basename(d)}"):
        for f in files:
            if f.endswith(".md"): stamped += stamp_note(os.path.relpath(os.path.join(root, f), VAULT).replace("\\", "/"), "removed", "")

json.dump({"date": stamp, "moves": moves, "relinked": relinked, "stamped": stamped}, open(os.path.join(HERE, "restructure-log.json"), "w", encoding="utf8"), indent=1)
print(f"moved {len(moves)}, relinked {relinked} notes, stamped {stamped}. Undo list: restructure-log.json")
