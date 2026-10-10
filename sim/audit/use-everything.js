// "Every player uses every single thing on their sheet": takes generated character sheets (sim/audit/l20/*.md by default), opens each in
// the real panel (jsdom + the real Apps Script logic), and
//   1. presses/types into EVERY control on EVERY page (generic walk, nothing skipped except page navigation),
//   2. spends every use of every tracker and every spell slot (and checks short/long rest give back the right ones),
//   3. plays out damage/temp HP/healing/death saves/conditions/exhaustion/hit dice,
//   4. sends the result to the Sheet and checks the Sheet agrees,
//   5. compares the character's wiki features (dnd2024.wikidot.com, from wiki_limited.json) with the trackers the panel created.
// Writes sim/audit/USE-EVERYTHING-REPORT.md and use-everything.json.
//   node use-everything.js [dir=l20] [filter]
"use strict";
const fs = require("fs"), path = require("path");
const assert = require("assert");
const { makeHarness } = require("../../test/harness");
const parse = require("./parse-dump");

const dir = path.join(__dirname, process.argv[2] || "l20"), filter = (process.argv[3] || "").toLowerCase();
const wikiLimited = fs.existsSync(path.join(__dirname, "wiki_limited.json")) ? JSON.parse(fs.readFileSync(path.join(__dirname, "wiki_limited.json"), "utf8")) : {};
const BAD = /\bNaN\b|undefined|\[object Object\]|Infinity/;
const words = (s) => String(s).toLowerCase().replace(/[^a-z' ]/g, " ").split(/\s+/).filter((w) => w.length >= 5 && !["spell", "cast", "magic", "level", "bonus", "action"].includes(w));

async function walk(h, rec) {
	const { view, window } = h;
	const tick = async () => { await h.tick(); await h.tick(); };
	const root = () => view.contentEl;
	const ev = (el, t) => el.dispatchEvent(new window.Event(t, { bubbles: true }));
	const seenNotices = () => h.notices.length;
	const sig = (e, nth) => `${e.tagName}|${e.type || ""}|${e.getAttribute("aria-label") || e.title || e.placeholder || e.className}|${(e.textContent || "").trim().slice(0, 24)}|${nth}`;
	const SKIP_CLASS = /csh-dot|csh-page-arrow/;
	const snapshot = () => {
		const counts = {}; const out = [];
		[...root().querySelectorAll("input,select,textarea,button")].forEach((e) => {
			if (SKIP_CLASS.test(e.className)) return;
			const base = sig(e, ""); counts[base] = (counts[base] || 0) + 1; out.push({ s: sig(e, counts[base] - 1), del: /csh-del-btn/.test(e.className) });
		});
		return out;
	};
	const resolve = (s) => {
		const counts = {};
		for (const e of root().querySelectorAll("input,select,textarea,button")) {
			if (SKIP_CLASS.test(e.className)) continue;
			const base = sig(e, ""); counts[base] = (counts[base] || 0) + 1;
			if (sig(e, counts[base] - 1) === s) return e;
		}
		return null;
	};
	const problems = (where) => {
		const t = root().textContent;
		if (BAD.test(t)) rec.errors.push(`${where}: screen shows "${(BAD.exec(t) || [""])[0]}"`);
	};
	async function act(s, where) {
		const e = resolve(s); if (!e) return false;
		const before = seenNotices();
		try {
			if (e.tagName === "BUTTON") ev(e, "click");
			else if (e.tagName === "SELECT") { for (const o of [...e.options]) { const cur = resolve(s); if (!cur) break; cur.value = o.value; ev(cur, "change"); await tick(); } rec.controls++; return true; }
			else if (e.type === "checkbox") { e.checked = !e.checked; ev(e, "change"); }
			else if (e.type === "number") { const n = Number(e.value) || 0; e.value = String(Math.max(0, n + 1)); ev(e, "change"); }
			else { e.value = "sim " + (e.placeholder || "text"); ev(e, "change"); }
			await tick();
		} catch (err) { rec.errors.push(`${where}: ${s} threw ${String(err.message).slice(0, 100)}`); }
		rec.controls++;
		h.notices.slice(before).forEach((n) => { if (/error|exception|NaN|undefined|went wrong/i.test(n)) rec.errors.push(`${where}: notice "${n.slice(0, 100)}"`); });
		if (h.modal) { // dice picker / level-up dialog: use what is in it, then close
			const m = h.modal; h.modal = null;
			try {
				[...m.contentEl.querySelectorAll("input")].forEach((i) => { i.value = i.type === "number" ? "5" : "sim"; ev(i, "change"); });
				const btns = [...m.contentEl.querySelectorAll("button")];
				for (const b of btns.slice(0, 12)) { ev(b, "click"); await tick(); rec.controls++; }
				if (m.close) m.close();
			} catch (err) { rec.errors.push(`${where}: dialog threw ${String(err.message).slice(0, 100)}`); }
		}
		return true;
	}

	await view.onOpen(); await tick();
	problems("open");
	const pages = [...root().querySelectorAll("button.csh-dot")].map((b) => b.getAttribute("aria-label"));
	rec.pages = pages.length;
	for (let pi = 0; pi < pages.length; pi++) {
		const dot = [...root().querySelectorAll("button.csh-dot")][pi]; if (!dot) continue;
		ev(dot, "click"); await tick();
		const where = pages[pi] || "page " + pi;
		const list = snapshot();
		for (const c of list.filter((x) => !x.del)) { await act(c.s, where); }
		problems(where);
		for (const c of list.filter((x) => x.del)) { await act(c.s, where); } // deletions last
		problems(where + " (after deletes)");
	}
}

function trackerChecks(h, rec) {
	return (async () => {
		const { view, window, fm } = h; const tick = async () => { await h.tick(); await h.tick(); };
		const press = async (label) => { const b = [...view.contentEl.querySelectorAll("button")].find((x) => x.getAttribute("aria-label") === label); if (!b) return false; b.dispatchEvent(new window.Event("click")); await tick(); return true; };
		const goto = async (frag) => { const d = [...view.contentEl.querySelectorAll("button.csh-dot")].find((b) => (b.getAttribute("aria-label") || "").includes(frag)); if (d) { d.dispatchEvent(new window.Event("click")); await tick(); } };
		const rest = async (label) => { const b = [...view.contentEl.querySelectorAll("button")].find((x) => x.textContent.includes(label)); if (b) { b.dispatchEvent(new window.Event("click")); await tick(); } };
		// start from a clean slate for the trackers the panel made for this character
		await view.render(); await tick(); await goto("Combat");
		const trackers = JSON.parse(JSON.stringify(fm.features || []));
		rec.trackers = trackers.map((t) => `${t.name} ${t.max} (${t.recovery})`);
		for (let i = 0; i < trackers.length; i++) {
			const t = trackers[i];
			if (!fm.features || !fm.features[i] || fm.features[i].name !== t.name) { rec.errors.push(`tracker ${t.name} vanished during the walk`); continue; }
			await goto("Combat");
			for (let k = 1; k <= t.max; k++) if (!(await press(`${t.name} use ${k}`))) { rec.errors.push(`no pip ${k} for ${t.name}`); break; }
			if (fm.features[i].used !== t.max) rec.errors.push(`${t.name}: spent every use but used=${fm.features[i].used}/${t.max}`);
		}
		await rest("Short"); // header Short
		(fm.features || []).forEach((f, i) => {
			const want = trackers[i] ? (trackers[i].recovery === "short" ? 0 : trackers[i].max) : null;
			if (want !== null && f.used !== want && f.recovery === trackers[i].recovery) rec.errors.push(`short rest: ${f.name} (${f.recovery}) used=${f.used}, expected ${want}`);
		});
		await rest("Long");
		(fm.features || []).forEach((f) => { if (f.used !== 0) rec.errors.push(`long rest: ${f.name} still used=${f.used}`); });
		// spell slots, every level, every slot
		await goto("Spells");
		for (const [lvl, s] of Object.entries(fm.spell_slots || {})) {
			for (let k = 1; k <= (s.max || 0); k++) await press(`Level ${lvl} slot ${k}`);
			if ((s.max || 0) > 0 && fm.spell_slots[lvl].used !== s.max) rec.errors.push(`spell slots level ${lvl}: used ${fm.spell_slots[lvl].used}/${s.max}`);
		}
		if (fm.pact_slots) { const before = fm.pact_slots.used; await rest("Short"); if (fm.pact_slots.used !== 0) rec.errors.push("pact slots not restored by a short rest"); void before; }
		await rest("Long");
		for (const [lvl, s] of Object.entries(fm.spell_slots || {})) if (s.used) rec.errors.push(`long rest: level ${lvl} slots still used`);
		rec.spellLevels = Object.entries(fm.spell_slots || {}).filter(([, s]) => s.max > 0).length;
		rec.pact = !!fm.pact_slots;
		// hit points, temp HP, death saves, conditions, exhaustion, hit dice
		await goto("Combat");
		await view.updateFrontmatter((f) => { f.hp = f.hp_max; f.temp_hp = 5; }); await view.render(); await tick(); await goto("Combat");
		const amt = view.contentEl.querySelector("input[placeholder='Amt']"); amt.value = "8"; amt.dispatchEvent(new window.Event("input"));
		const dmg = [...view.contentEl.querySelectorAll("button")].find((b) => b.textContent.includes("Damage")); dmg.dispatchEvent(new window.Event("click")); await tick();
		if (fm.temp_hp !== 0 || fm.hp !== fm.hp_max - 3) rec.errors.push(`damage with temp HP: temp ${fm.temp_hp}, hp ${fm.hp}/${fm.hp_max}`);
		const amt2 = view.contentEl.querySelector("input[placeholder='Amt']"); amt2.value = "9999"; // the panel redrew after the first hit: find the field again
		const dmg2 = [...view.contentEl.querySelectorAll("button")].find((b) => b.textContent.includes("Damage")); dmg2.dispatchEvent(new window.Event("click")); await tick();
		if (fm.hp !== 0) rec.errors.push("massive damage did not stop at 0 HP: " + fm.hp);
		const amt3 = view.contentEl.querySelector("input[placeholder='Amt']"); amt3.value = "9999";
		const heal = [...view.contentEl.querySelectorAll("button")].find((b) => b.textContent.includes("Heal")); heal.dispatchEvent(new window.Event("click")); await tick();
		if (fm.hp !== fm.hp_max) rec.errors.push(`heal did not cap at max: ${fm.hp}/${fm.hp_max}`);
		for (const l of ["Success", "Failure"]) { const row = [...view.contentEl.querySelectorAll(".csh-slot-row")].find((r) => r.textContent.includes(l)); if (row) for (const p of row.querySelectorAll("button.csh-pip")) { p.dispatchEvent(new window.Event("click")); await tick(); } }
		if (!fm.death_saves || fm.death_saves.successes !== 3 || fm.death_saves.failures !== 3) rec.errors.push("death save pips: " + JSON.stringify(fm.death_saves));
		for (const chip of [...view.contentEl.querySelectorAll("button.csh-condition-chip")]) { chip.dispatchEvent(new window.Event("click")); await tick(); }
		rec.conditions = (fm.conditions || []).length;
		for (let i = 0; i < 7; i++) await press("Increase exhaustion");
		if (fm.exhaustion !== 6) rec.errors.push("exhaustion cap: " + fm.exhaustion);
		await press("Heroic Inspiration");
		const total = Number(fm.hit_dice_total) || Number(fm.level) || 1;
		for (let i = 0; i < total + 1; i++) await press("Spend a hit die");
		if ((fm.hit_dice_used || 0) !== total) rec.errors.push(`hit dice: used ${fm.hit_dice_used}/${total}`);
		await rest("Long");
		if (fm.hp !== fm.hp_max) rec.errors.push("long rest did not restore HP");
		if ((fm.exhaustion || 0) !== 5) rec.errors.push("long rest should lower exhaustion by 1, now " + fm.exhaustion);
		// send to the Sheet and check it agrees
		await view.updateFrontmatter((f) => { f.hp = Math.max(1, f.hp_max - 4); f.gold = 123; }); await view.render(); await tick();
		const send = [...view.contentEl.querySelectorAll("button")].find((b) => b.textContent === "Send to sheet");
		if (send) {
			send.dispatchEvent(new window.Event("click")); for (let i = 0; i < 60 && Number(h.sheetRow()["HP"]) !== fm.hp; i++) await h.tick(); // wait for the round trip
			const r = h.sheetRow();
			if (Number(r["HP"]) !== fm.hp) rec.errors.push(`Sheet HP ${r["HP"]} != panel ${fm.hp}`);
			if (Number(r["Gold"]) !== 123) rec.errors.push(`Sheet gold ${r["Gold"]} != 123`);
		}
	})();
}

function coverage(base, sheet, parsed) {
	// wiki limited-use features for this class + subclass vs the trackers the panel made
	const cls = path.basename(base).split("__")[0].toLowerCase(), slug = (path.basename(base, ".md").split("__")[1] || "main").replace(/-/g, "_");
	const feats = [].concat(wikiLimited[`${cls}:main`] || [], wikiLimited[`${cls}:${slug}`] || []);
	const have = (sheet.trackers || []).map((t) => words(t));
	const sheetFeatures = (parsed.traits || []).map((t) => t.description || "").join(" ").toLowerCase();
	return feats.filter((f) => f.level <= 20).map((f) => {
		const fw = words(f.feature);
		const tracked = have.some((hw) => hw.some((w) => fw.some((x) => x.includes(w) || w.includes(x))));
		const onSheet = sheetFeatures.includes(f.feature.toLowerCase().slice(0, 12)) || fw.some((w) => sheetFeatures.includes(w));
		return { level: f.level, feature: f.feature, tracked, onSheet, line: (f.lines || [])[0] || "" };
	});
}

(async () => {
	let files = fs.readdirSync(dir).filter((f) => f.endsWith(".md") && (!filter || f.toLowerCase().includes(filter))).sort();
	const shard = (process.env.SHARD || "").match(/^(\d+)\/(\d+)$/); // SHARD=1/4 .. 4/4 runs a quarter of the sheets; REPORT=1 only merges the shard files
	if (shard) files = files.filter((_, i) => i % +shard[2] === +shard[1] - 1);
	if (process.env.REPORT) files = [];
	const results = [];
	for (const f of files) {
		const full = path.join(dir, f), text = fs.readFileSync(full, "utf8"), p = parse(text);
		const rec = { sheet: f, cls: p.class, sub: p.subclass, level: p.level, controls: 0, errors: [], pages: 0 };
		const slots = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => (p.spell_slots && p.spell_slots[l] && p.spell_slots[l].max) || 0);
		const guard = (e) => rec.errors.push("unhandled: " + String(e && e.message || e).slice(0, 120));
		process.on("unhandledRejection", guard);
		try {
			// the generated sheet carries the REAL Sheet's link comment; the test world has its own server, so give it a fresh link
			const tmp = path.join(require("os").tmpdir(), "mlg-audit-" + f); fs.writeFileSync(tmp, text.replace(/<!--\s*kadria-sync[\s\S]*?-->/, ""));
			const h = makeHarness({ fixture: tmp, character: { name: p.character, player: "ZZSTRESS_use", species: p.species, background: p.background, className: p.class, alignment: p.alignment }, stats: { level: p.level, hp: p.hp_max, ac: p.ac, subclassName: p.subclass, spellSlots: slots, equipment: [] } });
			await h.view.onOpen(); await h.tick(); await h.tick();
			await trackerChecks(h, rec);   // trackers/slots/HP flow first, on the freshly parsed character
			await walk(h, rec);            // then press everything else
			rec.features = JSON.parse(JSON.stringify(h.fm.features || []));
		} catch (e) { rec.errors.push("crashed: " + String(e.stack || e).split("\n").slice(0, 3).join(" | ")); }
		process.off("unhandledRejection", guard);
		rec.coverage = coverage(f, rec, p);
		results.push(rec);
		console.log(`${rec.errors.length ? "FAIL" : "ok  "} ${f}  controls=${rec.controls} trackers=${(rec.trackers || []).length} spellLevels=${rec.spellLevels} errors=${rec.errors.length}${rec.errors.length ? " :: " + rec.errors.slice(0, 2).join(" ; ").slice(0, 200) : ""}`);
	}
	if (shard) { fs.writeFileSync(path.join(__dirname, `use-everything.${shard[1]}of${shard[2]}.json`), JSON.stringify(results, null, 1)); console.log("shard done"); return; }
	if (process.env.REPORT) fs.readdirSync(__dirname).filter((f) => /^use-everything\.\d+of\d+\.json$/.test(f)).forEach((f) => results.push(...JSON.parse(fs.readFileSync(path.join(__dirname, f), "utf8"))));
	fs.writeFileSync(path.join(__dirname, "use-everything.json"), JSON.stringify(results, null, 1));
	const bad = results.filter((r) => r.errors.length);
	const gaps = results.flatMap((r) => r.coverage.filter((c) => !c.tracked).map((c) => ({ sheet: r.sheet, ...c })));
	const md = [`# Use-everything simulation (${new Date().toISOString().slice(0, 10)})`, "", `${results.length} sheets, ${results.reduce((a, r) => a + r.controls, 0)} control actions, ${bad.length} sheets with problems.`, ""];
	if (bad.length) { md.push("## Problems"); bad.forEach((r) => { md.push(`- **${r.sheet}**`); r.errors.slice(0, 8).forEach((e) => md.push(`  - ${e}`)); }); md.push(""); }
	md.push("## Wiki limited-use features with no tracker in My Little Guy");
	const byFeature = {};
	gaps.forEach((g) => { (byFeature[`${g.feature} (L${g.level})`] = byFeature[`${g.feature} (L${g.level})`] || []).push(g.sheet.replace(".md", "")); });
	Object.entries(byFeature).sort().forEach(([k, v]) => md.push(`- ${k}: ${v.length} sheets`));
	fs.writeFileSync(path.join(__dirname, "USE-EVERYTHING-REPORT.md"), md.join("\n") + "\n");
	console.log(`\n${results.length} sheets, ${bad.length} with problems. Report: sim/audit/USE-EVERYTHING-REPORT.md`);
})();
