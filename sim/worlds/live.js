// The "live" world: the REAL Character Intake form builds a brand-new character every run, the real Google Sheet is the
// server, and the simulated DM acts through the guarded test hook (Apps Script TestHook.js), which can only touch
// players whose name starts with ZZSTRESS_. Used by the iPhone device; also runnable from a desktop for a live smoke test.
//
// Needs: TEST_HOOK_SECRET (env or sim/.env.local -- the same value Glen put in the script property), Playwright
// (`npm i --no-save playwright`), and the Drive mirror folder so the generated .md can be read.
"use strict";
const fs = require("fs");
const path = require("path");
const { buildCharacter } = require("../live/form");

const ENDPOINT = process.env.SIM_ENDPOINT || "https://script.google.com/macros/s/AKfycbzpd3dobDjH70Nr9mHKBIlrtUE4HSW8I_rW_se_s5PjX8dCxyCIkCug1UN9M00vhadi/exec";
const DRIVE_DIR = process.env.SIM_DRIVE_DIR || "G:/My Drive/Kadria Character Sheets";

function secret() {
	if (process.env.TEST_HOOK_SECRET) return process.env.TEST_HOOK_SECRET;
	const f = path.join(__dirname, "..", ".env.local");
	const m = fs.existsSync(f) && /^TEST_HOOK_SECRET=(.+)$/m.exec(fs.readFileSync(f, "utf8"));
	if (!m) throw new Error("TEST_HOOK_SECRET is not set (env var or sim/.env.local). Glen sets the same value as a Script Property in the Apps Script project.");
	return m[1].trim();
}

async function post(body) {
	// Apps Script occasionally answers with an HTML error page (busy right after a submit); retry a couple of times.
	for (let attempt = 0; ; attempt++) {
		const r = await fetch(ENDPOINT, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "text/plain" }, redirect: "follow" });
		const text = await r.text();
		try { return JSON.parse(text); } catch (e) { if (attempt >= 3) throw new Error(`Apps Script answered ${r.status} with a non-JSON page: ${text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 160)}`); await new Promise((res) => setTimeout(res, 3000)); }
	}
}
const hook = async (op, extra) => { const r = await post({ action: "testhook", secret: secret(), op, ...extra }); if (!r.ok) throw new Error(`test hook ${op}: ${r.error || JSON.stringify(r)}`); return r; };

async function waitForFile(file, ms = 120000) {
	const end = Date.now() + ms;
	while (Date.now() < end) { if (fs.existsSync(file)) return; await new Promise((r) => setTimeout(r, 2000)); }
	throw new Error("the generated sheet never appeared in " + DRIVE_DIR + " (is Google Drive for desktop running?)");
}

async function makeLiveWorld({ runId }) {
	secret(); // fail early with the helpful message
	const tag = String(runId).replace(/\D/g, "").slice(-8);
	const persona = { player: "ZZSTRESS_sim" + tag, character: "ZZSTRESS_Sim " + tag, species: "Elf", cls: "Wizard", level: 3, background: "Sage", alignment: "Neutral Good" };
	await buildCharacter(persona); // the real form, a fresh character every time
	const fileName = `${persona.character} - ${persona.player}.md`;
	await waitForFile(path.join(DRIVE_DIR, fileName));
	const info = JSON.parse(/<!-- kadria-sync (\{.*?\}) -->/.exec(fs.readFileSync(path.join(DRIVE_DIR, fileName), "utf8"))[1]);

	const world = {
		kind: "live",
		character: { name: persona.character, player: persona.player, file: fileName, path: path.join(DRIVE_DIR, fileName) },
		async sheetRow() {
			const r = await (await fetch(`${ENDPOINT}?action=pull&id=${encodeURIComponent(info.id)}&token=${encodeURIComponent(info.token)}`)).json();
			if (!r.ok) throw new Error("pull failed: " + JSON.stringify(r));
			const p = r.playerOwned;
			return { hp: p.hp, hpMax: p.hpMax, ac: p.ac, gold: p.gold, inventory: p.inventory, spellSlots: typeof p.spellSlots === "string" ? p.spellSlots : JSON.stringify(p.spellSlots), party: r.dm && r.dm.party, lastPushed: r.lastPushed };
		},
		dm: {
			draft: (f) => hook("draft", { name: persona.character, player: persona.player, ...f }),
			award: (amount, reason) => hook("award", { name: persona.character, player: persona.player, amount, reason }),
			publish: () => hook("publish"),
		},
		cleanup: () => hook("cleanup"),
	};
	return world;
}

module.exports = { makeLiveWorld };
