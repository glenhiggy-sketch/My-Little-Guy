// Dumps what the live Character Intake form offers for one class at a given level (selects, option counts, section headings),
// so the audit can compare it with the wiki. Usage: node probe-form.js <Class> <level> [Subclass] > out.json
"use strict";
const { chromium } = require("playwright");
const URL = process.env.SIM_ENDPOINT || "https://script.google.com/macros/s/AKfycbzpd3dobDjH70Nr9mHKBIlrtUE4HSW8I_rW_se_s5PjX8dCxyCIkCug1UN9M00vhadi/exec";
(async () => {
	const [cls, level, sub] = [process.argv[2] || "Fighter", process.argv[3] || "20", process.argv[4]];
	const b = await chromium.launch(); const page = await b.newPage(); await page.goto(URL);
	let frame; for (let i = 0; i < 45; i++) { frame = page.frames().find((f) => f.url().includes("/blank")); if (frame && (await frame.locator("#characterName").count())) break; await page.waitForTimeout(1000); }
	await frame.locator("#species").selectOption({ index: 1 }); await frame.locator("#background").selectOption({ index: 1 });
	await frame.locator("#classRows select").first().selectOption({ label: cls });
	const lvl = frame.locator("#classRows input").first(); await lvl.fill(String(level)); await lvl.press("Tab");
	await page.waitForTimeout(1500);
	if (sub) { try { await frame.locator("#classRows select").nth(1).selectOption({ label: sub }); await page.waitForTimeout(1500); } catch (e) { console.error("subclass not selectable:", sub); } }
	const dump = await frame.evaluate(() => {
		const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
		const sels = [...document.querySelectorAll("select")].filter(vis).map((e) => ({ id: e.id, label: (e.closest("label,div,td") || {}).innerText ? (e.closest("div").innerText || "").slice(0, 60).replace(/\s+/g, " ") : "", n: e.options.length, selected: e.options[e.selectedIndex] && e.options[e.selectedIndex].text, opts: [...e.options].map((o) => o.text) }));
		const heads = [...document.querySelectorAll("h1,h2,h3,h4,legend,.card-title,.section-title,summary")].filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, " ")).filter(Boolean);
		const buttons = [...document.querySelectorAll("button")].filter(vis).map((e) => e.innerText.trim()).filter(Boolean);
		const inputs = [...document.querySelectorAll("input,textarea")].filter(vis).map((e) => ({ id: e.id, type: e.type, ph: e.placeholder }));
		return { sels, heads, buttons: [...new Set(buttons)].slice(0, 60), inputs: inputs.slice(0, 80), text: document.body.innerText.slice(0, 40000) };
	});
	console.log(JSON.stringify(dump, null, 1));
	await b.close();
})();
