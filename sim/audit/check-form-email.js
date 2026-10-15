// Real-browser check of the success screen's "Email me my character sheet" box and the copy button (the server call is stubbed).
const { chromium } = require("playwright");
const url = process.argv[2]; const target = url.startsWith("http") ? url : "file:///" + url.split("\\").join("/");
const fail = []; const expect = (ok, m) => { console.log((ok ? "ok   " : "FAIL ") + m); if (!ok) fail.push(m); };
(async () => {
  const b = await chromium.launch(); const ctxb = await b.newContext({ permissions: ["clipboard-read", "clipboard-write"] }); const p = await ctxb.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(target);
  await p.evaluate(() => {
    window.__calls = [];
    window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return { emailCharacterSheet(key, email) { window.__calls.push([key, email]); ok({ ok: true }); } }; } }; } } } };
    const el = statusEl; el.className = "ok";
    el.innerHTML = myLittleGuyPromoHtml("https://example.test/instr.pdf", { id: "C1", token: "t" }, true);
    wireSuccessExtras({ id: "C1", token: "t" });
  });
  expect(await p.locator("#emailBtn").count() === 1, "the email box is shown when mail is available");
  const links = await p.locator(".mlg-steps a").evaluateAll((as) => as.map((a) => a.href));
  expect(links.some((l) => /apps\.apple\.com/.test(l)) && links.some((l) => /play\.google\.com/.test(l)) && links.some((l) => /obsidian\.md\/download/.test(l)), "App Store, Google Play and desktop links are there");
  const steps = await p.locator(".mlg-steps").textContent();
  expect(/Kadria/.test(steps) && /skip it/i.test(steps) && /Restricted mode/.test(steps) && /ON in Community plugins/.test(steps) && /Books folder/.test(steps), "steps say: vault name, skip Sync, exit Restricted mode, enable the plugin, add the spell cards");
  await p.locator("#emailBtn").click();
  expect(/valid email/.test(await p.locator("#emailMsg").textContent()), "an empty address is refused in the page");
  await p.locator("#emailTo").fill("player@example.com");
  await p.locator("#emailBtn").click();
  const calls = await p.evaluate(() => window.__calls);
  expect(calls.length === 1 && calls[0][1] === "player@example.com" && calls[0][0].id === "C1", "the server is called with the key and address");
  expect(/Sent to player@example.com/.test(await p.locator("#emailMsg").textContent()), "success is shown");
  await p.locator(".mlg-steps summary").click();   // the steps are collapsed until opened
  await p.locator("#copyRepo").click();
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  expect(clip === "glenhiggy-sketch/My-Little-Guy", "Copy puts the repository name on the clipboard: " + clip);
  await p.evaluate(() => { statusEl.innerHTML = myLittleGuyPromoHtml(null, null, false); });
  expect(await p.locator("#emailBtn").count() === 0, "no email box when mail is not available");
  console.log("page errors:", errs.length, errs.slice(0, 2));
  await b.close(); process.exit(fail.length || errs.length ? 1 : 0);
})();
