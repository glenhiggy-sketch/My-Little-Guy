// Opens the form (file or URL) in a real browser and checks what each list offers with the Legacy toggle off and on.
// Usage: NODE_PATH=<node_modules with playwright> node check-form-lists.js <file-or-url>
const { chromium } = require("playwright");
const man = require("./vault-registry.json").entries;
const url = process.argv[2];
const target = url.startsWith("http") ? url : "file:///" + url.split("\\").join("/");

(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on("pageerror", e => errs.push(String(e)));
  await p.goto(target);
  const opts = id => p.evaluate(id => [...document.querySelectorAll("#" + id + " option")].filter(o => o.value).map(o => [o.value, o.parentElement.label || ""]), id);
  const read = async () => ({ species: await opts("species"), background: await opts("background") });
  const sub = cls => p.evaluate(cls => {
    const sels = document.querySelectorAll("#classesCard select");
    sels[0].value = cls; sels[0].dispatchEvent(new Event("change"));
    const s2 = document.querySelectorAll("#classesCard select")[1];
    return [...s2.querySelectorAll("option")].filter(o => o.value).map(o => [o.value, o.parentElement.label || ""]);
  }, cls);
  const classes = await p.evaluate(() => [...document.querySelectorAll("#classesCard select")[0].querySelectorAll("option")].filter(o => o.value).map(o => [o.value, o.parentElement.label || ""]));
  const off = await read(); const wizOff = await sub("Wizard"); const barbOff = await sub("Barbarian");
  await p.check("#showLegacy");
  const on = await read(); const wizOn = await sub("Wizard"); const barbOn = await sub("Barbarian");
  await p.uncheck("#showLegacy");
  const reOff = await read();
  const split = v => [v.slice(0, v.lastIndexOf("|")), v.slice(v.lastIndexOf("|") + 1)];
  const statusOf = (type, parent, v) => { const [n, e] = split(v); const r = man.find(m => m.type === type && (m.parent || "") === parent && m.name === n && m.edition === e); return r ? r.status : "?"; };
  const bad = [];
  [["species", off.species, ""], ["background", off.background, ""]].forEach(([t, l]) => l.forEach(([v]) => { if (!["main", "unverified"].includes(statusOf(t, "", v))) bad.push([t, v]); }));
  wizOff.forEach(([v]) => { if (!["main", "unverified"].includes(statusOf("subclass", "Wizard", v))) bad.push(["subclass", v]); });
  const dup = l => { const c = new Map(); l.forEach(([v]) => { const n = split(v)[0]; c.set(n, (c.get(n) || 0) + 1); }); return [...c].filter(([, n]) => n > 1).map(([k]) => k); };
  console.log("classes:", classes.length, "->", classes.map(c => c[0] + (c[1] ? "*" : "")).join(", "));
  console.log("legacy OFF  species", off.species.length, " backgrounds", off.background.length, " Wizard subclasses", wizOff.length, " Barbarian subclasses", barbOff.length);
  console.log("legacy ON   species", on.species.length, " backgrounds", on.background.length, " Wizard subclasses", wizOn.length, " Barbarian subclasses", barbOn.length);
  console.log("toggle off again -> species", reOff.species.length, "(should equal OFF)");
  console.log("hidden-status items visible with the toggle off:", bad.length, bad.slice(0, 5));
  console.log("same name offered twice with the toggle ON  species:", dup(on.species), " Wizard:", dup(wizOn), " Barbarian:", dup(barbOn));
  console.log("Wizard OFF:", wizOff.map(x => x[0]).join("; "));
  console.log("page errors:", errs.length, errs.slice(0, 2));
  await b.close();
})();
