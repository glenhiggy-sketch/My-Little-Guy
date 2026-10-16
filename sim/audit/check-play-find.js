// Real-browser check of the play page's backstop: when the link fails, a player can find their character by name.
// The Apps Script server is stubbed with page.route. Usage: NODE_PATH=<playwright> node check-play-find.js <play/index.html>
const { chromium } = require("playwright");
const url = process.argv[2];
const target = "file:///" + url.split("\\").join("/");
const fail = [];
const expect = (ok, msg) => { console.log((ok ? "ok   " : "FAIL ") + msg); if (!ok) fail.push(msg); };
const HASH = "#Cabcdef123.0123456789abcdef0123";
const note = { fileName: "Findable Fox - Pat.md", characterName: "Findable Fox", playerName: "Pat", text: "# Findable Fox\n" };

(async () => {
  const b = await chromium.launch();
  const errs = [];
  async function open(hash, handler) {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    p.on("pageerror", (e) => errs.push(String(e)));
    await p.route("**/macros/s/**", (route) => {
      const u = new URL(route.request().url()), cb = u.searchParams.get("callback"), act = u.searchParams.get("action");
      const out = handler(act, u);
      if (out === "abort") return route.abort();
      route.fulfill({ contentType: "application/javascript", body: cb + "(" + JSON.stringify(out) + ");" });
    });
    await p.goto(target + hash);
    return p;
  }

  let p = await open("", () => ({ ok: false }));
  expect(await p.locator("#finder").isVisible(), "an incomplete link shows the find box");
  await p.close();

  p = await open(HASH, (act) => act === "note" ? { ok: false, error: "not found or bad token" } : { ok: true, matches: [] });
  await p.locator("#finder").waitFor({ state: "visible", timeout: 10000 });
  expect(/find your character by name/.test(await p.locator("#state").textContent()), "a bad token shows the find box");
  await p.locator("#findQ").fill("nobody here");
  await p.locator("#findBtn").click();
  await p.locator("#findState", { hasText: /No character/ }).waitFor({ timeout: 10000 });
  expect(true, "no match says so");
  await p.close();

  p = await open(HASH, (act) => act === "note" ? "abort" : { ok: true, matches: [note] });
  await p.locator("#finder").waitFor({ state: "visible", timeout: 20000 });
  expect(/did not answer/.test(await p.locator("#state").textContent()), "a server that does not answer shows the message and the find box");
  await p.locator("#findQ").fill("Findable Fox");
  await p.locator("#findBtn").click();
  await p.locator("#matches button").first().waitFor({ timeout: 10000 });
  expect((await p.locator("#matches button").count()) === 1, "one match is listed");
  expect(await p.locator("#open").isDisabled(), "nothing opens until the player picks");
  await p.locator("#matches button").first().click();
  expect(!(await p.locator("#open").isDisabled()), "picking a match enables Open in Obsidian");
  expect(/not linked for syncing/.test(await p.locator("#state").textContent()), "the page says a found copy is not synced");
  expect(/Findable Fox/.test(await p.locator("#preview").textContent()), "the note is previewed");
  await p.close();

  p = await open(HASH, (act) => act === "note" ? { ok: true, fileName: "x.md", text: "# x" } : { ok: false });
  await p.locator("#open:not([disabled])").waitFor({ timeout: 10000 });
  expect(!(await p.locator("#finder").isVisible()), "the find box stays hidden when the link works");
  await p.close();

  console.log("page errors:", errs.length, errs.slice(0, 2));
  await b.close();
  process.exit(fail.length || errs.length ? 1 : 0);
})();
