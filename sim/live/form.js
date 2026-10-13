// Builds one character through the REAL live Character Intake form with Playwright, reacting to the form's own
// validation messages like a person would (ported from the vault's six-player simulation).
"use strict";

const FORM_URL = process.env.SIM_ENDPOINT || "https://script.google.com/macros/s/AKfycbzpd3dobDjH70Nr9mHKBIlrtUE4HSW8I_rW_se_s5PjX8dCxyCIkCug1UN9M00vhadi/exec";
const NOTE = "AUTOMATED SIMULATION - safe to delete. Not a real player character.";

async function getFormFrame(page) {
	// Apps Script nests the form two iframes deep; go straight to the Frame that has the form.
	for (let i = 0; i < 45; i++) {
		try { const f = page.frames().find((fr) => fr.url().includes("/blank")); if (f && (await f.locator("#characterName").count()) > 0) return f; } catch (e) { /* frame replaced mid-load */ }
		await page.waitForTimeout(1000);
	}
	throw new Error("form never loaded");
}

async function buildCharacter(p) {
	let chromium;
	try { ({ chromium } = require("playwright")); } catch (e) { throw new Error("Playwright is needed for the live world: npm i --no-save playwright && npx playwright install chromium"); }
	// SIM_PIN_IP: pin Apps Script's hosts to one working Google address when this network blocks the ones DNS returns (see DEPLOY.md).
	const pin = process.env.SIM_PIN_IP;
	const browser = await chromium.launch(pin ? { args: [`--host-resolver-rules=MAP script.google.com ${pin}, MAP *.googleusercontent.com ${pin}`] } : {});
	try {
		let page, frame;
		for (let load = 0; ; load++) {   // Google's front ends sometimes stall a load on a bad route: a person would just reload
			page = await browser.newPage();
			try { await page.goto(FORM_URL, { timeout: 60000 }); frame = await getFormFrame(page); break; }
			catch (e) { await page.close(); if (load >= 3) throw e; }
		}
		await frame.locator("#characterName").fill(p.character);
		await frame.locator("#playerName").fill(p.player);
		await frame.locator("#alignment").selectOption({ label: p.alignment });
		await frame.locator("#species").selectOption({ label: p.species });
		await frame.locator("#background").selectOption({ label: p.background });
		await frame.locator("#classRows select").first().selectOption({ label: p.cls });
		if (p.level > 1) { const lvl = frame.locator("#classRows input").first(); await lvl.fill(String(p.level)); await lvl.press("Tab"); }
		if (p.subclass) {   // the subclass list appears once the level allows one: choose it by name, like a person scanning the list
			const sel = frame.locator("#classRows select").nth(1);
			const idx = await sel.evaluate((s, label) => { let k = -1; [...s.options].forEach((o, i) => { if (k < 0 && o.text.includes(label)) k = i; }); return k; }, p.subclass);
			if (idx < 0) throw new Error("the form does not offer the subclass " + p.subclass);
			await sel.selectOption({ index: idx });
		}
		await frame.locator("#notes").fill(NOTE);
		let last = "";
		for (let attempt = 0; attempt < 14; attempt++) {
			await frame.locator("#submitBtn").click(); await page.waitForTimeout(900);
			const text = ((await frame.locator("#status").textContent()) || "").trim();
			if (/^Submitting|^Submitted/.test(text)) { await frame.locator("#status", { hasText: "Submitted" }).waitFor({ timeout: 150000 }); return; }
			if (/^Something went wrong/.test(text)) throw new Error(text);
			if (text === last) throw new Error("form kept rejecting after a fix attempt: " + text);
			last = text;
			if (/skill/i.test(text)) {
				const want = parseInt((text.match(/exactly (\d+)/) || [])[1] || "0", 10);
				const have = await frame.locator('#skillGrid input[type="checkbox"]:checked:not(:disabled)').count();
				for (let i = have; i < want; i++) await frame.locator('#skillGrid input[type="checkbox"]:not(:checked):not(:disabled)').first().click();
			} else if (/subclass/i.test(text)) {
				await frame.locator("#classRows select").nth(1).selectOption({ index: 1 });
			} else if (/cantrip|spell|metamagic|invocation|infusion|maneuver/i.test(text)) {
				const btns = frame.locator('#spellCard button:has-text("Assign Random"), #maneuversCard button:has-text("Assign Random")');
				for (let i = 0; i < (await btns.count()); i++) if (await btns.nth(i).isVisible()) await btns.nth(i).click();
			} else throw new Error("unhandled form message: " + text);
		}
		throw new Error("gave up after 14 submit attempts; last message: " + last);
	} finally { await browser.close(); }
}

module.exports = { buildCharacter };
