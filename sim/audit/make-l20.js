// Builds level-20 characters through the REAL Character Intake form: one per (class, subclass) that exists on dnd2024.wikidot.com AND is
// offered by the creator. Each sheet is copied to sim/audit/l20/<Class>__<Subclass>.md (gitignored). Test characters are ZZSTRESS_ and
// are removed afterwards with the test hook's cleanup. Needs Playwright (see sim/live/form.js) and Google Drive for desktop.
//   node make-l20.js [classFilter] [parallel=4]
"use strict";
const fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const FORM_URL = process.env.SIM_ENDPOINT || "https://script.google.com/macros/s/AKfycbzpd3dobDjH70Nr9mHKBIlrtUE4HSW8I_rW_se_s5PjX8dCxyCIkCug1UN9M00vhadi/exec";
const DRIVE_DIR = process.env.SIM_DRIVE_DIR || "G:/My Drive/Kadria Character Sheets";
const OUT = path.join(__dirname, "l20"); fs.mkdirSync(OUT, { recursive: true });
const cmp = JSON.parse(fs.readFileSync(path.join(__dirname, "subclass_compare.json"), "utf8"));
const norm = (s) => s.toLowerCase().replace(/\u2019/g, "'").replace(/\(.*?\)/g, "")
	.replace(/school of |path of the |path of |circle of the |circle of |college of the |college of |oath of the |oath of |warrior of the |warrior of |way of the |way of | domain| patron| sorcery| magic|the |order of |conclave|-| /g, "").trim();
const ALIAS = { abjurer: "abjuration", conjurer: "conjuration", diviner: "divination", enchanter: "enchantment", evoker: "evocation", illusionist: "illusion", necromancer: "necromancy", transmuter: "transmutation", bladesinger: "bladesing" };
const only = (process.argv[2] || "").toLowerCase(), PAR = +(process.argv[3] || 4);
const NOTE = "AUTOMATED SIMULATION - safe to delete. Not a real player character.";
const tag = String(Date.now()).slice(-5);

// the work list: wiki subclasses that the form offers
const jobs = [];
for (const c of cmp) {
	if (only && c.class.toLowerCase() !== only) continue;
	for (const w of c.wiki) {
		const key = ALIAS[w.replace(/-/g, " ")] ? norm(ALIAS[w.replace(/-/g, " ")]) : norm(w.replace(/-/g, " "));
		const match = c.form.filter((o) => { const n = norm(o); return n && (n.includes(key) || key.includes(n)); });
		if (match.length) jobs.push({ cls: c.class, wiki: w, label: match[0] });
	}
}

async function getFrame(page) {
	for (let i = 0; i < 45; i++) {
		try { const f = page.frames().find((fr) => fr.url().includes("/blank")); if (f && (await f.locator("#characterName").count()) > 0) return f; } catch (e) { /* frame replaced */ }
		await page.waitForTimeout(1000);
	}
	throw new Error("form never loaded");
}

async function build(job, n) {
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage(); await page.goto(FORM_URL);
		const frame = await getFrame(page);
		const player = `ZZSTRESS_l20${tag}${n}`, character = `ZZSTRESS_${job.cls}${tag}${n}`;
		await frame.locator("#characterName").fill(character); await frame.locator("#playerName").fill(player);
		await frame.locator("#alignment").selectOption({ label: "Neutral Good" });
		await frame.locator("#species").selectOption({ label: "Human" }); await frame.locator("#background").selectOption({ label: "Soldier" });
		await frame.locator("#classRows select").first().selectOption({ label: job.cls });
		const lvl = frame.locator("#classRows input").first(); await lvl.fill("20"); await lvl.press("Tab");
		await page.waitForTimeout(1200);
		// the subclass list repeats names (2014 then 2024): take the LAST option with the label, i.e. the 2024 one
		const idx = await frame.locator("#classRows select").nth(1).evaluate((s, label) => { let k = -1; [...s.options].forEach((o, i) => { if (o.text === label) k = i; }); return k; }, job.label);
		if (idx < 0) throw new Error("subclass option vanished: " + job.label);
		await frame.locator("#classRows select").nth(1).selectOption({ index: idx });
		await frame.locator("#notes").fill(NOTE);
		let last = "";
		for (let attempt = 0; attempt < 16; attempt++) {
			await frame.locator("#submitBtn").click(); await page.waitForTimeout(900);
			const text = ((await frame.locator("#status").textContent()) || "").trim();
			if (/^Submitting|^Submitted/.test(text)) { await frame.locator("#status", { hasText: "Submitted" }).waitFor({ timeout: 180000 }); break; }
			if (/^Something went wrong/.test(text)) throw new Error(text);
			if (text === last) throw new Error("form kept rejecting: " + text);
			last = text;
			if (/skill/i.test(text)) {
				const want = parseInt((text.match(/exactly (\d+)/) || [])[1] || "0", 10);
				const have = await frame.locator('#skillGrid input[type="checkbox"]:checked:not(:disabled)').count();
				for (let i = have; i < want; i++) await frame.locator('#skillGrid input[type="checkbox"]:not(:checked):not(:disabled)').first().click();
			} else if (/cantrip|spell|metamagic|invocation|infusion|maneuver|option/i.test(text)) {
				const btns = frame.locator('#spellCard button:has-text("Assign Random"), #maneuversCard button:has-text("Assign Random")');
				for (let i = 0; i < (await btns.count()); i++) if (await btns.nth(i).isVisible()) await btns.nth(i).click();
			} else throw new Error("unhandled form message: " + text);
		}
		const file = `${character} - ${player}.md`, src = path.join(DRIVE_DIR, file);
		for (let i = 0; i < 90 && !fs.existsSync(src); i++) await new Promise((r) => setTimeout(r, 2000));
		if (!fs.existsSync(src)) throw new Error("sheet never reached Drive: " + file);
		const dest = path.join(OUT, `${job.cls}__${job.wiki}.md`); fs.copyFileSync(src, dest);
		return dest;
	} finally { await browser.close(); }
}

(async () => {
	console.log(`${jobs.length} characters to build`);
	const queue = jobs.map((j, i) => ({ ...j, n: i })), done = [], failed = [];
	const skip = new Set(fs.readdirSync(OUT).map((f) => f.replace(/\.md$/, "")));
	async function worker() {
		while (queue.length) {
			const j = queue.shift();
			if (skip.has(`${j.cls}__${j.wiki}`)) { done.push(j.cls + "/" + j.wiki + " (kept)"); continue; }
			try { await build(j, j.n); done.push(j.cls + "/" + j.wiki); console.log("built", j.cls, j.wiki); }
			catch (e) { failed.push(j.cls + "/" + j.wiki + ": " + String(e.message).slice(0, 140)); console.log("FAILED", j.cls, j.wiki, String(e.message).slice(0, 140)); }
		}
	}
	await Promise.all(Array.from({ length: PAR }, worker));
	console.log("SUMMARY " + JSON.stringify({ built: done.length, failed }));
})();
