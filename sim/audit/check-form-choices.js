// Real-browser check of the Class Choices card. Usage: NODE_PATH=<playwright> node check-form-choices.js <file-or-url>
const { chromium } = require("playwright");
const url = process.argv[2];
const target = url.startsWith("http") ? url : "file:///" + url.split("\\").join("/");
const fail = [];
const expect = (ok, msg) => { console.log((ok ? "ok   " : "FAIL ") + msg); if (!ok) fail.push(msg); };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(target);
  const setClass = (cls, level, sub) => p.evaluate(([cls, level, sub]) => {
    const sels = document.querySelectorAll("#classesCard select");
    sels[0].value = cls; sels[0].dispatchEvent(new Event("change"));
    const lvl = document.querySelector("#classesCard input[type=number]");
    lvl.value = String(level); lvl.dispatchEvent(new Event("change"));
    if (sub) { const s2 = document.querySelectorAll("#classesCard select")[1]; const o = [...s2.options].find((x) => x.value.startsWith(sub + "|")); if (o) { s2.value = o.value; s2.dispatchEvent(new Event("change")); } }
  }, [cls, level, sub]);
  const card = () => p.evaluate(() => { const c = document.getElementById("choicesCard"); return { shown: c.style.display !== "none", text: c.innerText }; });

  await setClass("Fighter", 10, null);
  let c = await card();
  expect(c.shown && /Weapon Mastery/.test(c.text) && /0 \/ 5/.test(c.text), "a level 10 Fighter picks 5 weapon masteries");
  expect(/Greataxe \(Cleave\)/.test(c.text), "weapons show their mastery property");
  for (let i = 0; i < 5; i++) await p.evaluate(() => { [...document.querySelectorAll("#choicesSections input[type=checkbox]")].find((x) => !x.checked && !x.disabled).click(); });
  c = await card();
  expect(/5 \/ 5/.test(c.text), "five picks fill the choice");
  const disabled = await p.evaluate(() => [...document.querySelectorAll("#choicesSections input[type=checkbox]")].filter((x) => !x.checked).every((x) => x.disabled));
  expect(disabled, "no sixth pick is possible");

  await setClass("Cleric", 7, null);
  c = await card();
  expect(/Divine Order/.test(c.text) && /Blessed Strikes/.test(c.text), "a level 7 Cleric sees Divine Order and Blessed Strikes");

  await setClass("Wizard", 20, null);
  c = await card();
  expect(/Signature Spells/.test(c.text) && /0 \/ 2/.test(c.text), "a level 20 Wizard picks two Signature Spells");

  await setClass("Rogue", 6, null);
  c = await card();
  expect(/Weapon Mastery/.test(c.text) && /Expertise/.test(c.text), "a Rogue sees Weapon Mastery and Expertise");
  expect(/Choose your skills above first|0 \/ 4/.test(c.text), "Expertise waits for skills and then offers 4 picks at level 6");

  await setClass("Barbarian", 3, "Path of the Wild Heart");
  // (the subclass option is only offered while Legacy is off if it is a main subclass)
  c = await card();
  expect(/Rage of the Wilds/.test(c.text), "a Wild Heart Barbarian sees Rage of the Wilds");
  console.log("page errors:", errs.length, errs.slice(0, 2));
  await b.close();
  process.exit(fail.length || errs.length ? 1 : 0);
})();
