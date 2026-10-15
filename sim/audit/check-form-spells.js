// Real-browser check of the cantrip / spell pick window: small, searchable, alphabetised, chips to remove, Assign Random still works.
// Usage: NODE_PATH=<playwright> node check-form-spells.js <file-or-url>
const { chromium } = require("playwright");
const url = process.argv[2];
const target = url.startsWith("http") ? url : "file:///" + url.split("\\").join("/");
const fail = [];
const expect = (ok, msg) => { console.log((ok ? "ok   " : "FAIL ") + msg); if (!ok) fail.push(msg); };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(target);
  await p.evaluate(() => {
    const sels = document.querySelectorAll("#classesCard select");
    sels[0].value = "Wizard"; sels[0].dispatchEvent(new Event("change"));
    const lvl = document.querySelector("#classesCard input[type=number]");
    lvl.value = "5"; lvl.dispatchEvent(new Event("change"));
  });
  const wins = await p.locator("#spellSections .pick-window").count();
  expect(wins === 2, "a Wizard sees two pick windows (cantrips and spells): " + wins);
  const none = await p.locator("#spellSections input[type=checkbox]").count();
  expect(none === 0, "the long checkbox grids are gone");

  const win = p.locator("#spellSections .pick-window").first();
  const list = win.locator(".pick-list");
  const box = await list.boundingBox();
  expect(box && box.height <= 200, "the list is a short window (" + Math.round(box.height) + "px high)");
  const scrollable = await list.evaluate((el) => el.scrollHeight > el.clientHeight);
  expect(scrollable || (await win.locator(".pick-item").count()) <= 6, "a long list scrolls inside its window");

  const names = await win.locator(".pick-item span:first-child").allTextContents();
  const sorted = names.slice().sort((a, c) => a.localeCompare(c));
  expect(names.length > 5 && JSON.stringify(names) === JSON.stringify(sorted), "suggestions are alphabetised (" + names.length + " cantrips)");

  await win.locator(".pick-search").fill("fire");
  const filtered = await win.locator(".pick-item span:first-child").allTextContents();
  expect(filtered.length >= 1 && filtered.every((n) => /fire/i.test(n)) && filtered.includes("Fire Bolt"), "typing filters the list: " + filtered.join(", "));
  await win.locator(".pick-search").fill("zzzz");
  expect(/match/i.test(await win.locator(".pick-empty").textContent()), "no matches says so");
  await win.locator(".pick-search").fill("fire bolt");
  await win.locator(".pick-item").first().click();
  const chip = await p.locator("#spellSections .pick-window").first().locator(".pick-chip").allTextContents();
  expect(chip.length === 1 && /Fire Bolt/.test(chip[0]), "tapping a suggestion adds a chip: " + chip.join(","));
  const stillListed = await p.locator("#spellSections .pick-window").first().locator(".pick-item span:first-child").allTextContents();
  expect(!stillListed.includes("Fire Bolt"), "a chosen cantrip leaves the suggestions");
  const count = await p.locator("#spellSections .skill-count").first().textContent();
  expect(/Chosen 1 \/ 4/.test(count), "the count follows: " + count.trim());

  await p.locator("#spellSections .pick-window").first().locator(".pick-chip").first().click();
  const afterRemove = await p.locator("#spellSections .pick-window").first().locator(".pick-chip").count();
  expect(afterRemove === 0, "tapping a chip removes it");

  // Enter adds the top match
  const s2 = p.locator("#spellSections .pick-window").first().locator(".pick-search");
  await s2.fill("light"); await s2.press("Enter");
  const afterEnter = await p.locator("#spellSections .pick-window").first().locator(".pick-chip").allTextContents();
  expect(afterEnter.length === 1, "Enter adds the first match: " + afterEnter.join(","));

  // fill the rest by Assign Random: no more than the limit
  await p.locator('#spellCard button:has-text("Assign Random")').first().click();
  const full = await p.locator("#spellSections .skill-count").first().textContent();
  expect(/Chosen 4 \/ 4/.test(full), "Assign Random fills to the limit: " + full.trim());
  const disabled = await p.locator("#spellSections .pick-window").first().locator(".pick-item:not([disabled])").count();
  expect(disabled === 0, "when full no suggestion can be added");

  // page height: the card should be far shorter than before
  const cardH = await p.locator("#spellCard").evaluate((el) => el.getBoundingClientRect().height);
  expect(cardH < 1100, "the whole spell section is " + Math.round(cardH) + "px tall at phone width (was several thousand)");
  console.log("page errors:", errs.length, errs.slice(0, 2));
  await b.close();
  process.exit(fail.length || errs.length ? 1 : 0);
})();
