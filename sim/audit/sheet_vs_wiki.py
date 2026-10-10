"""For each generated level-20 sheet: which class/subclass features does the wiki list (levels 1-20) that the sheet's
"Class Features" line does not name?  Usage: python sheet_vs_wiki.py <wiki html folder> <sheets folder>  -> sheet_vs_wiki.json + markdown on stdout"""
import re, html, sys, os, json
wiki, sheets = sys.argv[1], sys.argv[2]

def page_text(f):
    t = open(os.path.join(wiki, f), encoding="utf8", errors="ignore").read()
    m = re.search(r'id="page-content">(.*?)<div class="page-tags"', t, re.S)
    t = m.group(1) if m else t
    t = re.sub(r"<(script|style).*?</\1>", " ", t, flags=re.S)
    t = re.sub(r"<(br|/p|/li|/tr|/h\d|/div)[^>]*>", "\n", t)
    return html.unescape(re.sub(r"<[^>]+>", " ", t)).replace(" ", " ")

def features(f):
    t = page_text(f)
    out = []
    for m in re.finditer(r"(?:^|\n)\s*Level (\d+): ([^\n]+)", t):
        lvl, name = int(m.group(1)), re.sub(r"\s+", " ", m.group(2)).strip()
        if lvl <= 20 and not re.search(r"Subclass$|Subclass Feature|Ability Score Improvement", name): out.append((lvl, name))
    return out

def norm(s): return re.sub(r"[^a-z]", "", s.lower())

rows = []
for sf in sorted(os.listdir(sheets)):
    if not sf.endswith(".md"): continue
    cls, slug = sf[:-3].split("__")
    text = open(os.path.join(sheets, sf), encoding="utf8", errors="ignore").read()
    line = (re.search(r"\*\*Class Features \([^)]+\):\*\*[ \t]*(.+)", text) or [None, ""])[1]
    species = text[text.find("**Species Traits"):text.find("## Personality")] if "**Species Traits" in text else ""
    have = norm(line)
    generic = len(re.findall(r"Subclass Feature", line))
    wf = features(f"p_{cls.lower()}_main.html") + features(f"p_{cls.lower()}_{slug.replace('-', '_')}.html")
    missing = [(l, n) for l, n in wf if norm(n) not in have]
    rows.append({"sheet": sf[:-3], "wiki_features": len(wf), "missing": missing, "generic_placeholders": generic, "sheet_features": len([x for x in line.split(",") if x.strip()])})
json.dump(rows, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "sheet_vs_wiki.json"), "w"), indent=1)
tot_w = sum(r["wiki_features"] for r in rows); tot_m = sum(len(r["missing"]) for r in rows)
print(f"{len(rows)} sheets; wiki lists {tot_w} class+subclass features (levels 1-20); {tot_m} are not named on the sheets ({100*tot_m//max(1,tot_w)}%).")
for r in rows:
    print(f"- {r['sheet']}: wiki {r['wiki_features']}, missing {len(r['missing'])}, generic 'Subclass Feature' placeholders {r['generic_placeholders']}: " + "; ".join(f"L{l} {n}" for l, n in r["missing"][:6]))
