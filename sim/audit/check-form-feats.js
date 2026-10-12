// Real-browser check of the feat picker: ASI slots offer General/Origin/Fighting Style feats with prerequisites, level 19 offers Epic Boons only.
// Usage: NODE_PATH=<node_modules with playwright> node check-form-feats.js <file-or-url>
const { chromium } = require("playwright");
const url = process.argv[2];
const target = url.startsWith("http") ? url : "file:///" + url.split("\\").join("/");
const fail = [];
const expect = (ok, msg) => { console.log((ok ? "ok   " : "FAIL ") + msg); if (!ok) fail.push(msg); };

(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(target);
  await p.evaluate(() => {
    const sels = document.querySelectorAll("#classesCard select");
    sels[0].value = "Fighter"; sels[0].dispatchEvent(new Event("change"));
    const lvl = document.querySelector("#classesCard input[type=number]");
    lvl.value = "19"; lvl.dispatchEvent(new Event("change"));
  });
  const rows = await p.evaluate(() => [...document.querySelectorAll("#classesCard span")].map((s) => s.textContent).filter((t) => /ASI:|Epic Boon:/.test(t)));
  expect(rows.some((t) => /Level 4 ASI/.test(t)) && rows.some((t) => /Level 19 Epic Boon/.test(t)), "slots at 4..16 are ASIs and 19 is an Epic Boon: " + rows.join(", "));

  const sels = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll("#classesCard select").forEach((s) => {
      const groups = [...s.querySelectorAll("optgroup")].map((g) => g.label);
      if (groups.some((g) => /feats/i.test(g))) out.push({ groups, n: s.options.length, first: s.options[0].textContent, gwm: [...s.options].find((o) => o.value === "Great Weapon Master") ? { disabled: [...s.options].find((o) => o.value === "Great Weapon Master").disabled } : null, fate: !![...s.options].find((o) => o.value === "Boon of Fate") });
    });
    return out;
  });
  const boon = sels.filter((s) => s.groups.length === 1 && /Epic Boon/.test(s.groups[0]));
  const asi = sels.filter((s) => s.groups.some((g) => /General/.test(g)));
  expect(boon.length === 1 && boon[0].fate && boon[0].n > 30, "the level 19 slot offers only Epic Boons (" + (boon[0] ? boon[0].n : 0) + " options)");
  expect(asi.length >= 1 && asi[0].groups.includes("General feats") && asi[0].groups.includes("Origin feats") && asi[0].groups.includes("Fighting Style feats"), "ASI slots group feats by category: " + (asi[0] ? asi[0].groups.join("; ") : "none"));
  expect(asi.every((s) => !s.fate), "no Epic Boon in an ordinary ASI slot");
  expect(asi[0] && asi[0].gwm !== null, "Great Weapon Master is listed (Level 4+, Strength 13+)" + (asi[0] && asi[0].gwm ? ", disabled=" + asi[0].gwm.disabled : ""));

  // picking a feat that offers a choice shows the +1 picker
  const shown = await p.evaluate(() => {
    const s = [...document.querySelectorAll("#classesCard select")].find((x) => [...x.querySelectorAll("optgroup")].some((g) => /General/.test(g.label)));
    const row = s.parentElement;
    s.value = "Observant"; s.dispatchEvent(new Event("change"));
    const inc = [...row.querySelectorAll("select")].find((x) => [...x.options].some((o) => /^\+1 /.test(o.textContent)));
    return inc ? [...inc.options].map((o) => o.textContent) : null;
  });
  expect(Array.isArray(shown) && shown.length >= 2, "choosing Observant offers a +1 ability pick: " + JSON.stringify(shown));
  console.log("page errors:", errs.length, errs.slice(0, 2));
  await b.close();
  process.exit(fail.length || errs.length ? 1 : 0);
})();
