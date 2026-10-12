// Builds one level 20 sheet per wiki subclass the creator offers, locally (no network), into l20-local/<Class>__<wiki slug>.md.
// Same work list as make-l20.js, so sheet_vs_wiki.py can compare them against the saved wiki pages.
//   node local-l20.js [classFilter]      then:  python sheet_vs_wiki.py wiki-snapshot l20-local
"use strict";
const fs = require("fs"), path = require("path");
const { build } = require("./local-build");
const OUT = path.join(__dirname, "l20-local"); fs.mkdirSync(OUT, { recursive: true });
const cmp = JSON.parse(fs.readFileSync(path.join(__dirname, "subclass_compare.json"), "utf8"));
// what the form offers by default now: the subclasses the content manifest calls main (the old compare file still lists the 2014 doubles)
const reg = JSON.parse(fs.readFileSync(path.join(__dirname, "vault-registry.json"), "utf8")).entries;
const offered = (cls) => reg.filter((e) => e.type === "subclass" && e.parent === cls && e.status === "main").map((e) => e.name);
const norm = (s) => s.toLowerCase().replace(/’/g, "'").replace(/\(.*?\)/g, "")
  .replace(/school of |path of the |path of |circle of the |circle of |college of the |college of |oath of the |oath of |warrior of the |warrior of |way of the |way of | domain| patron| sorcery| magic|order of |conclave|^the /g, "").replace(/[^a-z]/g, "");
const ALIAS = { abjurer: "abjuration", conjurer: "conjuration", diviner: "divination", enchanter: "enchantment", evoker: "evocation", illusionist: "illusion", necromancer: "necromancy", transmuter: "transmutation", bladesinging: "bladesinger", clockworksoul: "clockwork", aberrantmind: "aberrant", draconicbloodline: "draconic", fourelements: "elements", undying: "undead" };
const only = (process.argv[2] || "").toLowerCase();
let n = 0, failed = [];
for (const c of cmp) {
  if (only && c.class.toLowerCase() !== only) continue;
  for (const w of c.wiki) {
    const k = norm(w.replace(/-/g, " ")), key = ALIAS[k] || k;
    const match = offered(c.class).filter((o) => { const m = norm(o); return m && (m.includes(key) || key.includes(m)); });
    if (!match.length) continue;
    try {
      const r = build({ cls: c.class, sub: match[0], level: 20 });
      fs.writeFileSync(path.join(OUT, `${c.class}__${w}.md`), r.text);
      n++;
    } catch (e) { failed.push(`${c.class}/${w}: ${e.message}`); }
  }
}
console.log(`built ${n} sheets into ${OUT}` + (failed.length ? `; ${failed.length} failed:\n  ` + failed.join("\n  ") : ""));
