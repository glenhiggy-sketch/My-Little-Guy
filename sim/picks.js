// A player who CHOOSES instead of accepting defaults: specific weapon masteries, specific feats at each ability score improvement,
// +1 ability picks, Expertise skills and Signature Spells, all through the real form link. The sheet that comes back must carry exactly
// those choices. Usage: SIM_PIN_IP=<google ip> node sim/picks.js
"use strict";
const fs = require("fs"), path = require("path");
const ENDPOINT = process.env.SIM_ENDPOINT || "https://script.google.com/macros/s/AKfycbzpd3dobDjH70Nr9mHKBIlrtUE4HSW8I_rW_se_s5PjX8dCxyCIkCug1UN9M00vhadi/exec";
const secret = () => { if (process.env.TEST_HOOK_SECRET) return process.env.TEST_HOOK_SECRET; return /^TEST_HOOK_SECRET=(.+)$/m.exec(fs.readFileSync(path.join(__dirname, ".env.local"), "utf8"))[1].trim(); };
const { chromium } = require("playwright");
const tag = String(Date.now()).slice(-6);

async function post(body) {
	for (let a = 0; ; a++) {
		try { const r = await fetch(ENDPOINT, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "text/plain" }, redirect: "follow" }); return JSON.parse(await r.text()); }
		catch (e) { if (a >= 3) throw e; await new Promise((x) => setTimeout(x, 3000)); }
	}
}
const hook = (op, extra) => post({ action: "testhook", secret: secret(), op, ...extra });
const results = []; const ok = (name, cond, detail = "") => { results.push(!!cond); console.log(`  ${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : "  " + detail}`); };

async function run(label, persona, picks) {
	console.log(label);
	const pin = process.env.SIM_PIN_IP;
	const browser = await chromium.launch(pin ? { args: [`--host-resolver-rules=MAP script.google.com ${pin}, MAP *.googleusercontent.com ${pin}`] } : {});
	try {
		const page = await browser.newPage();
		let f;
		for (let i = 0; i < 4 && !f; i++) {
			try { await page.goto(ENDPOINT, { timeout: 60000 }); } catch (e) { continue; }
			for (let k = 0; k < 45 && !f; k++) { const c = page.frames().find((fr) => fr.url().includes("/blank")); try { if (c && (await c.locator("#characterName").count())) f = c; } catch (e) { /* mid-load */ } if (!f) await page.waitForTimeout(1000); }
		}
		if (!f) throw new Error("form never loaded");
		await f.locator("#characterName").fill(persona.character); await f.locator("#playerName").fill(persona.player);
		await f.locator("#alignment").selectOption({ label: "Neutral Good" });
		await f.locator("#species").selectOption({ label: persona.species }); await f.locator("#background").selectOption({ label: persona.background });
		const row = f.locator("#classRows > div").first();
		await row.locator("select").first().selectOption({ label: persona.cls });
		await f.locator("#classRows > div").first().locator("input").first().fill(String(persona.level));
		await f.locator("#classRows > div").first().locator("input").first().press("Tab");
		const sub = f.locator("#classRows > div").first().locator("select").nth(1);
		const idx = await sub.evaluate((s, l) => { let k = -1; [...s.options].forEach((o, j) => { if (k < 0 && o.text.includes(l)) k = j; }); return k; }, persona.subclass);
		await sub.selectOption({ index: idx });

		// ability score improvements: the slots are the selects that group feats by category
		const slots = await f.evaluate(() => [...document.querySelectorAll("#classesCard select")].filter((s) => [...s.querySelectorAll("optgroup")].some((g) => /General/.test(g.label))).length);
		for (let i = 0; i < Math.min(slots, picks.feats.length); i++) {
			const want = picks.feats[i];
			await f.evaluate(([i, want]) => {
				const sel = [...document.querySelectorAll("#classesCard select")].filter((s) => [...s.querySelectorAll("optgroup")].some((g) => /General/.test(g.label)))[i];
				sel.value = want.feat; sel.dispatchEvent(new Event("change"));
				if (want.inc) { const row = sel.parentElement; const inc = [...row.querySelectorAll("select")].find((x) => [...x.options].some((o) => /^\+1 /.test(o.textContent))); if (inc) { const o = [...inc.options].find((o) => o.textContent.includes(want.inc)); if (o) { inc.value = o.value; inc.dispatchEvent(new Event("change")); } } }
			}, [i, want]);
		}
		// class choices by name: tick the checkbox whose label text starts with the name
		const tick = async (names) => f.evaluate((names) => { const miss = []; names.forEach((n) => {
			const box = [...document.querySelectorAll("#choicesSections input[type=checkbox]")].find((x) => !x.checked && !x.disabled && ((x.closest("label") || x.parentElement).textContent || "").trim().startsWith(n));
			if (box) box.click(); else miss.push(n); }); return miss; }, names);
		const missing = [...(await tick(picks.masteries || [])), ...(await tick(picks.signature || []))];
		await f.locator("#notes").fill("AUTOMATED SIMULATION - safe to delete. Not a real player character.");
		let last = "";
		for (let a = 0; a < 14; a++) {
			await f.locator("#submitBtn").click(); await page.waitForTimeout(900);
			const text = ((await f.locator("#status").textContent()) || "").trim();
			if (/^Submitting|^Submitted/.test(text)) { await f.locator("#status", { hasText: "Submitted" }).waitFor({ timeout: 150000 }); break; }
			if (text === last || /^Something went wrong/.test(text)) throw new Error("form said: " + text);
			last = text;
			if (/skill/i.test(text)) { const want = parseInt((text.match(/exactly (\d+)/) || [])[1] || "0", 10); const have = await f.locator('#skillGrid input[type="checkbox"]:checked:not(:disabled)').count(); for (let i = have; i < want; i++) await f.locator('#skillGrid input[type="checkbox"]:not(:checked):not(:disabled)').first().click(); }
			else if (/cantrip|spell|metamagic|invocation|infusion|maneuver/i.test(text)) { const b = f.locator('#spellCard button:has-text("Assign Random")'); for (let i = 0; i < (await b.count()); i++) if (await b.nth(i).isVisible()) await b.nth(i).click(); }
			else throw new Error("unhandled form message: " + text);
		}
		let r; for (let i = 0; i < 20; i++) { r = await hook("file", { name: persona.character, player: persona.player }); if (r.ok) break; await new Promise((x) => setTimeout(x, 3000)); }
		return { text: r.text || "", missing };
	} finally { await browser.close(); }
}

(async () => {
	try {
		const a = await run("1. Fighter 10 (Champion): chosen masteries and chosen feats", { character: `ZZSTRESS_Picks ${tag}-1`, player: `ZZSTRESS_k${tag}1`, species: "Human", background: "Soldier", cls: "Fighter", subclass: "Champion", level: 10 },
			{ masteries: ["Greatsword", "Longbow", "Handaxe", "Lance", "Warhammer"], feats: [{ feat: "Great Weapon Master" }, { feat: "Observant", inc: "Wisdom" }, { feat: "Alert" }] });
		ok("every chosen weapon mastery was ticked in the form", a.missing.length === 0, a.missing.join(","));
		for (const w of ["Greatsword", "Longbow", "Handaxe", "Lance", "Warhammer"]) ok(`the sheet lists the mastery you chose: ${w}`, new RegExp("Chosen:[^\\n]*" + w).test(a.text) || new RegExp("Weapon Mastery[^\\n]*" + w).test(a.text));
		for (const ft of ["Great Weapon Master", "Observant", "Alert"]) ok(`the sheet lists the feat you chose: ${ft}`, a.text.includes(ft));
		ok("the +1 you chose on Observant raised Wisdom", /Observant[^\n]*Wisdom/.test(a.text) || /\| Wisdom \| [+-]?\d+ \| (1[1-9]|20) \|/.test(a.text), "no Wisdom increase visible");

		const b = await run("2. Wizard 20 (Illusion): chosen Signature Spells", { character: `ZZSTRESS_Picks ${tag}-2`, player: `ZZSTRESS_k${tag}2`, species: "Elf", background: "Sage", cls: "Wizard", subclass: "School of Illusion", level: 20 },
			{ feats: [{ feat: "War Caster" }, { feat: "Resilient" }], signature: ["Counterspell", "Fireball"] });
		ok("both Signature Spells were ticked in the form", b.missing.length === 0, b.missing.join(","));
		ok("the sheet names the Signature Spells you chose", /Signature Spells[^\n]*Counterspell/.test(b.text) && /Signature Spells[^\n]*Fireball|Counterspell[^\n]*Fireball|Chosen: Counterspell, Fireball/.test(b.text));
		ok("the sheet lists War Caster", b.text.includes("War Caster"));
	} finally {
		try { console.log("cleanup:", JSON.stringify(await hook("cleanup"))); } catch (e) { console.log("cleanup failed:", e.message); }
	}
	console.log(`\n${results.filter(Boolean).length} of ${results.length} checks passed`);
	process.exit(results.every(Boolean) ? 0 : 1);
})();
