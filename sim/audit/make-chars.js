// Builds one level-9 character per mechanically heavy class through the REAL form (ZZSTRESS_ names, cleaned up afterwards),
// then copies the generated sheets to sim/audit/chars/ for the feature audit.
"use strict";
const fs = require("fs"), path = require("path");
const { buildCharacter } = require("../live/form");
const DRIVE_DIR = process.env.SIM_DRIVE_DIR || "G:/My Drive/Kadria Character Sheets";
const OUT = path.join(__dirname, "chars"); fs.mkdirSync(OUT, { recursive: true });
const CLASSES = ["Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk", "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard", "Artificer"];
const tag = String(Date.now()).slice(-6);
const LEVEL = +(process.env.AUDIT_LEVEL || 9);
const mk = (cls) => ({ player: "ZZSTRESS_aud" + tag + cls.slice(0, 3), character: "ZZSTRESS_" + cls + tag, species: "Human", cls, level: LEVEL, background: "Soldier", alignment: "Neutral Good" });
(async () => {
	const queue = CLASSES.map(mk), done = [], failed = [];
	async function worker() {
		while (queue.length) {
			const p = queue.shift();
			try {
				await buildCharacter(p);
				const f = `${p.character} - ${p.player}.md`, src = path.join(DRIVE_DIR, f);
				for (let i = 0; i < 60 && !fs.existsSync(src); i++) await new Promise((r) => setTimeout(r, 2000));
				fs.copyFileSync(src, path.join(OUT, p.cls + ".md")); done.push(p.cls); console.log("built", p.cls);
			} catch (e) { failed.push(p.cls + ": " + e.message.slice(0, 150)); console.log("FAILED", p.cls, e.message.slice(0, 150)); }
		}
	}
	await Promise.all([worker(), worker(), worker(), worker()]);
	console.log(JSON.stringify({ done, failed }));
})();
