"""Retires B:/New folder/plugin test.vault: proves what in it is already in the Kadria vault or the archive, archives the whole
thing, moves what is still needed into Kadria, and only then removes the original. Phases (each separate and re-runnable):
  audit     classify every file (identical in Kadria / identical in archive / counterpart by name / unique)
  archive   copy the whole vault into the sandbox with sha256 verification and a MANIFEST
  extract   move what is still needed into Kadria (code -> the Kadria appscript repo, one UA note -> Books) and write the record
  verify    re-check: every archived file hashes right, every Kadria counterpart exists, the code matches
  retire    remove the original folder, only if verify passes and every file in it is in the archive
Usage: python retire_plugin_vault.py audit | archive --apply | extract --apply | verify | retire --apply
"""
import hashlib, json, os, re, sys, collections, shutil, datetime

OLD = "B:/New folder/plugin test.vault"
KADRIA = "C:/Kadria.vault"
SANDBOX = "B:/New folder/Kadria Archive Sandbox"
DEST = f"{SANDBOX}/plugin-test.vault-full"
APPSCRIPT = "B:/New folder/Second Brain.vault/_Agent-Only/code/kadria-appscript"   # the single home of the Intake code from now on
CODE_DIR = "Kadria Character Intake Clasp"
RECORD = f"{DEST}/EXTRACTION-RECORD.json"
HERE = os.path.dirname(os.path.abspath(__file__))

# old Books note with no Kadria counterpart -> (place in Kadria Books, status, edition)
EXTRA_NOTES = {
    "2024/Fighter Subclasses/Fighter-PurpleDragonKnight.md": ("5e/Unearthed Arcana/Fighter-PurpleDragonKnight.md", "pending", "2024"),
}
CODE_VOLATILE = ("Index.html", "Data_ContentManifest.js", "assets/import-test/README.md")   # edited on purpose after the copy (manifest wiring, path fix)


def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""): h.update(b)
    return h.hexdigest()


def walk(root, skip=()):
    for r, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in (".git", "node_modules")]
        for f in files:
            p = os.path.join(r, f)
            rel = os.path.relpath(p, root).replace("\\", "/")
            if any(rel.startswith(s) for s in skip): continue
            yield rel, p


def index_by_size(root):
    idx = collections.defaultdict(list)
    for _, p in walk(root):
        try: idx[os.path.getsize(p)].append(p)
        except OSError: pass
    return idx


def norm(s): return re.sub(r"[^a-z]", "", s.lower().replace("\u2019", "'"))


def title(p):
    t = open(p, encoding="utf8", errors="replace").read()
    m = re.search(r"^#\s+(.+)$", t, re.M)
    return (m.group(1) if m else os.path.splitext(os.path.basename(p))[0]).strip()


def body(p):
    t = open(p, encoding="utf8", errors="replace").read().replace("\r\n", "\n")
    return re.sub(r"\s+", " ", re.sub(r"\A---\n.*?\n---\n", "", t, flags=re.S)).strip()


def audit():
    kad, arc = index_by_size(KADRIA), index_by_size(SANDBOX)
    kad_names = collections.defaultdict(list)
    for rel, p in walk(f"{KADRIA}/Books"): kad_names[os.path.basename(p)].append(rel)
    cache = {}
    def h(p):
        if p not in cache: cache[p] = sha(p)
        return cache[p]
    rows = []
    for rel, p in walk(OLD, skip=(CODE_DIR + "/", ".obsidian/")):
        s, status = os.path.getsize(p), "unique"
        for label, idx in (("same-in-kadria", kad), ("same-in-archive", arc)):
            if s in idx and any(h(q) == h(p) for q in idx[s]): status = label; break
        if status == "unique" and os.path.basename(p) in kad_names: status = "counterpart-in-kadria"
        rows.append({"path": rel, "size": s, "status": status})
    json.dump(rows, open(os.path.join(HERE, "plugin-vault-audit.json"), "w", encoding="utf8"), indent=1)
    c = collections.Counter(r["status"] for r in rows)
    print(len(rows), "files:", dict(c))


def archive(apply):
    files = list(walk(OLD))
    print(f"{len(files)} files, {sum(os.path.getsize(p) for _, p in files) / 1e6:.1f} MB -> {DEST}")
    if not apply: print("dry run; pass --apply"); return
    os.makedirs(DEST, exist_ok=True)
    manifest, bad = [], 0
    for rel, p in files:
        q = f"{DEST}/{rel}"
        os.makedirs(os.path.dirname(q), exist_ok=True)
        if not os.path.exists(q) or os.path.getsize(q) != os.path.getsize(p): shutil.copy2(p, q)
        a, b = sha(p), sha(q)
        bad += a != b
        manifest.append({"path": rel, "size": os.path.getsize(p), "sha256": a})
    json.dump({"archived": datetime.date.today().isoformat(), "source": OLD, "files": manifest}, open(f"{DEST}/MANIFEST.json", "w", encoding="utf8"), indent=1)
    open(f"{DEST}/README.md", "w", encoding="utf8").write(
        f"# plugin test.vault, archived {datetime.date.today().isoformat()}\n\nFull copy of `{OLD}` taken before it was retired: {len(files)} files, each\n"
        "sha256-verified against the original (`MANIFEST.json`). Read-only history; nothing reads this folder.\n\n"
        "What was still needed was moved: the Intake code to the Kadria appscript repo "
        f"(`{APPSCRIPT}`) and one note into `C:/Kadria.vault/Books`. `EXTRACTION-RECORD.json` lists, for every Books note, the Kadria note\n"
        "that replaces it. Restore anything by copying it back from here.\n")
    print(f"copied and verified {len(files)} files; mismatches: {bad}")
    sys.exit(1 if bad else 0)


def counterparts():
    """old Books note -> best Kadria Books note (same file name, else same title)."""
    byname, bytitle = collections.defaultdict(list), collections.defaultdict(list)
    for rel, p in walk(f"{KADRIA}/Books"):
        if rel.endswith(".md"):
            byname[os.path.basename(p)].append(rel)
            bytitle[norm(title(p))].append(rel)
    out = {}
    for rel, p in walk(f"{OLD}/Books"):
        if not rel.endswith(".md"): continue
        t, b = title(p), os.path.basename(p)
        c = byname.get(b) or bytitle.get(norm(t)) or bytitle.get(norm(t.split(":", 1)[-1])) or byname.get(re.sub(r"-?2014(?=\.md$)", "", b)) or []
        out[rel] = sorted(c, key=lambda x: ("/_" in x, x))[0] if c else None
    return out


def extract(apply):
    notes, missing = {}, []
    for rel, k in counterparts().items():
        if k: notes[f"Books/{rel}"] = {"kadria": f"Books/{k}", "bodyIdentical": body(f"{OLD}/Books/{rel}") == body(f"{KADRIA}/Books/{k}")}
        elif rel in EXTRA_NOTES: notes[f"Books/{rel}"] = {"kadria": f"Books/{EXTRA_NOTES[rel][0]}", "bodyIdentical": None, "moved": True}
        else: missing.append(rel)
    kcards = {os.path.basename(p): p for _, p in walk(f"{KADRIA}/Books/Spell Cards")}
    cards = {}
    for rel, p in walk(f"{OLD}/Books/Spell Cards"):
        q = kcards.get(os.path.basename(p))
        if q and sha(p) == sha(q): cards[f"Books/Spell Cards/{rel}"] = os.path.relpath(q, KADRIA).replace("\\", "/")
    print(f"Books notes mapped to Kadria: {len(notes)}   with no home: {len(missing)}   spell card images identical in Kadria: {len(cards)}")
    for m in missing: print("  NO HOME:", m)
    if missing: sys.exit(1)
    code_files = [rel for rel, _ in walk(f"{OLD}/{CODE_DIR}") if not rel.startswith(".claude/")]
    print(f"code: {len(code_files)} files -> {APPSCRIPT}")
    if not apply: print("dry run; pass --apply"); return
    for rel, (dest, st, ed) in EXTRA_NOTES.items():
        d = f"{KADRIA}/Books/{dest}"
        os.makedirs(os.path.dirname(d), exist_ok=True)
        shutil.copy2(f"{OLD}/Books/{rel}", d)
        t = open(d, encoding="utf8").read()
        if "kadria-status:" not in t:
            open(d, "w", encoding="utf8").write(f"---\ntags:\n- type/subclass\n- class/fighter\nkadria-status: {st}\nkadria-edition: {ed}\n---\n\n" + t)
    for rel in code_files:
        src, d = f"{OLD}/{CODE_DIR}/{rel}", f"{APPSCRIPT}/{rel}"
        os.makedirs(os.path.dirname(d), exist_ok=True)
        if not os.path.exists(d) or sha(d) != sha(src): shutil.copy2(src, d)   # the old vault's copy is the newest (today's manifest wiring)
    gi = f"{APPSCRIPT}/.gitignore"
    if not os.path.exists(gi) or ".clasp.json" not in open(gi).read(): open(gi, "a").write(".clasp.json\n")
    rec = {"extracted": datetime.date.today().isoformat(), "oldVault": OLD, "archive": DEST, "codeHome": APPSCRIPT, "kadria": KADRIA,
           "code": {rel: {"sha256": sha(f"{OLD}/{CODE_DIR}/{rel}")} for rel in code_files},
           "books": notes, "spellCards": cards,
           "archiveOnly": "everything else: test fixtures, old generated sheets, stress-test reports, the early Kadria Character Intake .gs copy, .obsidian"}
    json.dump(rec, open(RECORD, "w", encoding="utf8"), indent=1)
    shutil.copy2(RECORD, os.path.join(HERE, "plugin-vault-extraction-record.json"))
    print("extracted; record:", RECORD)


def verify():
    rec = json.load(open(RECORD, encoding="utf8"))
    man = json.load(open(f"{DEST}/MANIFEST.json", encoding="utf8"))
    bad = []
    for f in man["files"]:
        q = f"{DEST}/{f['path']}"
        if not os.path.exists(q) or sha(q) != f["sha256"]: bad.append(("archive", f["path"]))
    for rel, v in rec["code"].items():
        q = f"{rec['codeHome']}/{rel}"
        if not os.path.exists(q): bad.append(("code missing", rel))
        elif rel not in CODE_VOLATILE and sha(q) != v["sha256"]: bad.append(("code differs", rel))
    for old, v in rec["books"].items():
        if not os.path.exists(f"{KADRIA}/{v['kadria']}"): bad.append(("kadria note missing", v["kadria"]))
    for old, k in rec["spellCards"].items():
        if not os.path.exists(f"{KADRIA}/{k}"): bad.append(("kadria card missing", k))
    print(f"archive files {len(man['files'])}, code files {len(rec['code'])}, Books notes {len(rec['books'])}, spell cards {len(rec['spellCards'])}: problems {len(bad)}")
    for b in bad[:20]: print("  ", b)
    return not bad


def retire(apply):
    if not verify(): print("verify failed; nothing removed"); sys.exit(1)
    man = json.load(open(f"{DEST}/MANIFEST.json", encoding="utf8"))
    known = {f["path"] for f in man["files"]}
    extra = [rel for rel, _ in walk(OLD) if rel not in known]
    if extra: print("files in the old vault that are not in the archive:", extra[:10]); sys.exit(1)
    print(f"old vault: {sum(1 for _ in walk(OLD))} files, all archived and verified")
    if not apply: print("dry run; pass --apply to remove it"); return
    shutil.rmtree(OLD)
    print("removed", OLD)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "audit"
    apply = "--apply" in sys.argv
    if cmd == "audit": audit()
    elif cmd == "archive": archive(apply)
    elif cmd == "extract": extract(apply)
    elif cmd == "verify": sys.exit(0 if verify() else 1)
    elif cmd == "retire": retire(apply)
