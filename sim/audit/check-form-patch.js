// Real-browser check of the form patch: class above background, a feat only once, scores rolled once, spinner on submit.
// Usage: NODE_PATH=<playwright> node check-form-patch.js <file-or-url>
const { chromium } = require("playwright");
const url = process.argv[2];
const target = url.startsWith("http") ? url : "file:///" + url.split("\\").join("/");
const fail = [];
const expect = (ok, msg) => { console.log((ok ? "ok   " : "FAIL ") + msg); if (!ok) fail.push(msg); };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(target);

  const order = await p.evaluate(() => {
    const y = (sel) => document.querySelector(sel).getBoundingClientRect().top;
    return { cls: y("#classesCard"), species: y("#species"), bg: y("#background") };
  });
  expect(order.cls < order.species && order.cls < order.bg, "the class card sits above species and background");

  // two ASI slots on one Fighter: the feat taken in the first is unavailable in the second
  await p.evaluate(() => {
    const sel = document.querySelector("#classesCard select");
    sel.value = "Fighter"; sel.dispatchEvent(new Event("change"));
    const lvl = document.querySelector("#classesCard input[type=number]");
    lvl.value = "8"; lvl.dispatchEvent(new Event("change"));
  });
  const asi = p.locator("#classRows select").filter({ has: p.locator('option[value="Alert"]') });
  expect((await asi.count()) >= 2, "a level 8 Fighter has several feat pickers: " + (await asi.count()));
  await asi.nth(0).selectOption("Alert");
  const dis = await asi.nth(1).locator('option[value="Alert"]').evaluate((o) => o.disabled);
  expect(dis, "Alert is greyed out in the second picker once taken in the first");
  const stillFree = await asi.nth(1).locator('option[value="Tough"]').evaluate((o) => o.disabled);
  expect(!stillFree, "other feats stay available");
  await asi.nth(0).selectOption("");
  const freed = await asi.nth(1).locator('option[value="Alert"]').evaluate((o) => o.disabled);
  expect(!freed, "clearing the first picker frees the feat again");
  // Assign Random never hands out the same feat twice
  let dup = 0;
  for (let i = 0; i < 25; i++) {
    await p.locator('#classRows button:has-text("Assign Random")').first().click();
    const feats = await p.evaluate(() => Array.from(document.querySelectorAll("#classRows select")).filter((s) => s.querySelector('option[value="Alert"]')).map((s) => s.value).filter(Boolean));
    if (new Set(feats).size !== feats.length) dup++;
  }
  expect(dup === 0, "Assign Random never repeats a feat (25 runs)");

  // rolled once
  await p.locator('input[name="abilityMethod"][value="Rolled"]').check();
  await p.locator("#rollBtn").click();
  const first = await p.locator("#rolledHint").textContent();
  expect(await p.locator("#rollBtn").isDisabled(), "the Roll Scores button locks after the first roll");
  await p.locator("#rollBtn").click({ force: true }).catch(() => {});
  expect((await p.locator("#rolledHint").textContent()) === first, "the rolled set does not change");

  // spinner: watch the status box while submit runs
  await p.evaluate(() => { window.__spin = false; new MutationObserver((recs) => { if (recs.some((r) => Array.from(r.addedNodes).some((n) => n.classList && n.classList.contains("spinner")))) window.__spin = true; }).observe(document.getElementById("status"), { childList: true, subtree: true }); });
  await p.evaluate(() => document.getElementById("charForm").dispatchEvent(new Event("submit", { cancelable: true })));
  await p.waitForTimeout(200);
  expect(await p.evaluate(() => window.__spin), "a spinner shows in the status box when Submit is pressed");
  console.log("page errors:", errs.length, errs.slice(0, 2));
  await b.close();
  process.exit(fail.length || errs.length ? 1 : 0);
})();
