"""Reads saved dnd2024.wikidot.com class/subclass pages and lists every feature that has limited uses or a rest recharge.
Usage: python wiki_features.py <folder with p_<class>_<name>.html files>  -> prints markdown, writes wiki_limited.json"""
import re, html, sys, os, json
d = sys.argv[1]
def text(f):
    t = open(os.path.join(d, f), encoding="utf8", errors="ignore").read()
    m = re.search(r'id="page-content">(.*?)<div class="page-tags"', t, re.S)
    t = m.group(1) if m else t
    t = re.sub(r"<(script|style).*?</\1>", " ", t, flags=re.S)
    t = re.sub(r"<(br|/p|/li|/tr|/h\d|/div)[^>]*>", "\n", t)
    t = html.unescape(re.sub(r"<[^>]+>", " ", t)).replace("\u00a0", " ")
    return re.sub(r"[ \t]+", " ", t)
LIM = re.compile(r"(Long Rest|Short Rest|Short or Long Rest|Dawn|number of times|uses? of this|expend|once you use|can't use (it|this) again|Rest\b)", re.I)
out = {}
for f in sorted(os.listdir(d)):
    if not f.startswith("p_") or f.endswith("spell_list.html"): continue
    name = f[2:-5].replace("_", ":", 1)
    t = text(f)
    parts = re.split(r"\n\s*Level (\d+): ([^\n]+)\n", "\n" + t)
    feats = []
    for i in range(1, len(parts) - 2, 3):
        lvl, fname, body = int(parts[i]), parts[i + 1].strip(), parts[i + 2]
        sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+", re.sub(r"\s+", " ", body)) if LIM.search(s)]
        if sents: feats.append({"level": lvl, "feature": fname, "lines": sents[:4]})
    out[name] = feats
json.dump(out, open(os.path.join(d, "wiki_limited.json"), "w"), indent=1)
for k, v in out.items():
    print(f"\n## {k}")
    for x in v: print(f"- L{x['level']} {x['feature']}: " + " | ".join(l[:170] for l in x["lines"][:2]))
