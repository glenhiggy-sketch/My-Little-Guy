// Behavioural check for the Legacy toggle: a legacy pick must disappear when the toggle goes off, and unverified picks must survive.
// Usage: NODE_PATH=<node_modules with playwright> node check-form-toggle.js <file-or-url>
const { chromium } = require("playwright");
const url = process.argv[2];
const target = url.startsWith("http") ? url : "file:///" + url.split("\\").join("/");
const fail = [];
const expect = (ok, msg) => { console.log((ok ? "ok   " : "FAIL ") + msg); if (!ok) fail.push(msg); };

(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on("pageerror", e => errs.push(String(e)));
  await p.goto(target);
  const val = sel => p.$eval(sel, e => e.value);
  const has = (sel, v) => p.$eval(sel, (e, v) => [...e.options].some(o => o.value === v), v);

  // species: Aasimar is main, Aarakocra is legacy (2014)
  expect(await has("#species", "Aasimar|2024"), "main species offered with the toggle off");
  expect(!(await has("#species", "Aarakocra|2014")), "legacy species hidden with the toggle off");
  await p.check("#showLegacy");
  expect(await has("#species", "Aarakocra|2014"), "legacy species offered with the toggle on");
  await p.selectOption("#species", "Aarakocra|2014");
  expect(await p.$eval("#speciesWarn", e => e.classList.contains("show")), "legacy pick shows the warning");
  await p.uncheck("#showLegacy");
  expect((await val("#species")) === "", "legacy species pick is cleared when the toggle goes off");
  expect(!(await p.$eval("#speciesWarn", e => e.classList.contains("show"))), "warning clears with it");

  // subclass: Barbarian Path of the Storm Herald is legacy
  await p.check("#showLegacy");
  const pick = async cls => p.evaluate(cls => { const s = document.querySelectorAll("#classesCard select"); s[0].value = cls; s[0].dispatchEvent(new Event("change")); }, cls);
  await pick("Barbarian");
  const subOpts = () => p.evaluate(() => [...document.querySelectorAll("#classesCard select")[1].options].map(o => o.value));
  const legacyVal = (await subOpts()).find(v => v.startsWith("Path of the Storm Herald"));
  expect(!!legacyVal, "legacy subclass offered with the toggle on");
  await p.selectOption("#classesCard select >> nth=1", legacyVal);
  await p.uncheck("#showLegacy");
  expect((await p.evaluate(() => document.querySelectorAll("#classesCard select")[1].value)) === "", "legacy subclass pick cleared when the toggle goes off");
  expect(!(await subOpts()).some(v => v.startsWith("Path of the Storm Herald")), "legacy subclass gone from the list");

  // unverified class: Gunslinger is offered, in its own group, and its subclasses are unverified
  await pick("Gunslinger");
  const groups = await p.evaluate(() => [...document.querySelectorAll("#classesCard select")[1].querySelectorAll("optgroup")].map(g => g.label));
  expect(groups.some(g => g.startsWith("Unverified")), "Gunslinger subclasses are grouped as Unverified");
  console.log("page errors:", errs.length, errs.slice(0, 2));
  await b.close();
  process.exit(fail.length || errs.length ? 1 : 0);
})();
