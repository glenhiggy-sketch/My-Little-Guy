// Turns My Little Guy's wiki-checked CLASS_RESOURCES table (functions) into plain rows, so the same numbers can live in the Kadria vault
// as a readable table (Books/5.5e/Feature Uses.md) that Character Intake reads. One-off bootstrap; the vault note is the source afterwards.
//   node uses_from_mlg.js > uses-rows.json
"use strict";
const fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "..", "main.js"), "utf8");
const m = src.match(/const CLASS_RESOURCES = \{[\s\S]*?\r?\n\};\r?\n/);
const ONE = () => 1;
const CLASS_RESOURCES = new Function("ONE", m[0].replace("const CLASS_RESOURCES =", "return") )(ONE);

const ABIL = ["str", "dex", "con", "int", "wis", "cha"];
const NAME = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
function env(lv, mods) {
  const mod = (k) => mods[k] || 0;
  return { lv, prof: 2 + Math.floor((lv - 1) / 4), mod, uses: (k) => Math.max(1, mod(k)), step: (rows) => rows.reduce((v, [min, val]) => (lv >= min ? val : v), 0) };
}
function describeMax(fn, from) {
  if (typeof fn !== "function") return String(fn);
  const text = fn.toString();
  if (/c\.prof/.test(text)) return "Proficiency Bonus";
  const base = []; for (let lv = from; lv <= 20; lv++) base.push(fn(env(lv, {})));
  for (const k of ABIL) {
    const withMod = fn(env(20, { [k]: 4 }));
    if (withMod !== fn(env(20, {})) || /c\.uses\('/.test(text) && text.includes(`'${k}'`)) return `${NAME[k]} modifier (minimum 1)`;
  }
  // proportional to class level (Focus Points, Lay on Hands pool)
  let k = base[0] / from;
  if (Number.isInteger(k) && k > 0 && base.every((v, i) => v === k * (from + i))) return k === 1 ? "Class level" : `${k} x class level`;
  // flat or stepped by level
  const out = []; let last = null;
  for (let lv = from; lv <= 20; lv++) { const v = fn(env(lv, {})); if (v !== last) { out.push(last === null ? String(v) : `${v} at level ${lv}`); last = v; } }
  return out.join("; ");
}
function describeRest(r, from) {
  if (typeof r !== "function") return r === "short" ? "Short Rest" : "Long Rest";
  let last = null; const out = [];
  for (let lv = from; lv <= 20; lv++) { const v = r(env(lv, {})); if (v !== last) { out.push(last === null ? (v === "short" ? "Short Rest" : "Long Rest") : `${v === "short" ? "Short Rest" : "Long Rest"} at level ${lv}`); last = v; } }
  return out.join("; ");
}
const rows = [];
for (const [cls, t] of Object.entries(CLASS_RESOURCES)) {
  for (const r of t.base) rows.push({ class: cls, sub: "", from: r[0], name: r[1], uses: describeMax(r[2], r[0]), recovery: describeRest(r[3], r[0]) });
  for (const [keys, list] of Object.entries(t.subs)) for (const r of list) rows.push({ class: cls, sub: keys, from: r[0], name: r[1], uses: describeMax(r[2], r[0]), recovery: describeRest(r[3], r[0]) });
}
console.log(JSON.stringify(rows, null, 1));
