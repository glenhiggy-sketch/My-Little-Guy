"""Puts the 2024 "Cantrips Known" and "Prepared Spells" columns into the vault's class tables, from the saved wiki class pages
(wiki-class-tables.json, written by the table parser). The vault tables had the 2014 shape (no prepared column for Cleric, Druid,
Paladin, Ranger, Wizard, Artificer; "Spells Known" for Sorcerer). Character Intake reads these columns, so the vault now carries
the numbers. Idempotent. Dry run by default.   Usage: python vault_fix_spell_tables.py [--apply]"""
import json, os, re, sys

V = "C:/Kadria.vault/Books/5.5e/"
HERE = os.path.dirname(os.path.abspath(__file__))
APPLY = "--apply" in sys.argv
wiki = json.load(open(os.path.join(HERE, "wiki-class-tables.json"), encoding="utf8"))
DROP = {"cantrips known", "cantrips", "prepared spells", "spells known"}


def col(hdr, *names):
    low = [h.lower() for h in hdr]
    for n in names:
        if n in low: return low.index(n)
    return None


changed = 0
for cls, tbl in wiki.items():
    hdr = [h.lower() for h in tbl["hdr"]]
    ci, pi = col(tbl["hdr"], "cantrips"), col(tbl["hdr"], "prepared spells")
    cantrips = {int(r[0]): r[ci] for r in tbl["rows"]} if ci is not None else None
    prepared = {int(r[0]): r[pi] for r in tbl["rows"]}
    p = f"{V}{cls.capitalize()}/{cls.capitalize()}.md"
    t = open(p, encoding="utf8").read(); nl = "\r\n" if "\r\n" in t else "\n"
    lines = t.replace("\r\n", "\n").split("\n")
    s = next(i for i, l in enumerate(lines) if re.match(r"^\|\s*Level\s*\|", l))
    e = s
    while e < len(lines) and lines[e].lstrip().startswith("|"): e += 1
    rows = [[c.strip() for c in l.strip().strip("|").split("|")] for l in lines[s:e]]
    h = rows[0]
    keep = [i for i, c in enumerate(h) if c.lower() not in DROP]
    fi = max(i for i in keep if h[i].lower() == "features") if any(h[i].lower() == "features" for i in keep) else 2
    pos = keep.index(fi) + 1
    new_hdr = [h[i] for i in keep]
    add = (["Cantrips Known"] if cantrips else []) + ["Prepared Spells"]
    new_hdr[pos:pos] = add
    out = ["| " + " | ".join(new_hdr) + " |", "|" + "|".join(["---"] * len(new_hdr)) + "|"]
    for r in rows[2:]:
        if len(r) < len(h) or not r[0].isdigit():
            out.append("| " + " | ".join(r) + " |"); continue
        lv = int(r[0]); cells = [r[i] for i in keep]
        vals = ([cantrips[lv]] if cantrips else []) + [prepared[lv]]
        cells[pos:pos] = vals
        out.append("| " + " | ".join(cells) + " |")
    new = lines[:s] + out + lines[e:]
    u = nl.join(new)
    if u != t:
        changed += 1
        print(("wrote " if APPLY else "would write ") + p.replace(V, "") + "  columns: " + ", ".join(new_hdr))
        if APPLY: open(p, "w", encoding="utf8", newline="").write(u)
print(changed, "class notes", "changed" if APPLY else "would change")
