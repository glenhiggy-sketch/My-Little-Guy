// Local test for TestHook.js. Run: node TestHook.test.js
"use strict";
const fs = require("fs");
const vm = require("vm");
const assert = require("assert");
const { ss, ctx, props, driveFiles } = require("./test_fakes").makeEnv();

for (const f of ["Sync.js", "Publish.js", "TestHook.js"]) vm.runInContext(fs.readFileSync(__dirname + "/" + f, "utf8"), ctx);
const S = vm.runInContext("({upsertDatabaseRow_, doPost, pullCharacter_, leaderboardData_, getCharactersSheet_, getPublishedSheet_, getAwardsSheet_})", ctx);
const post = (b) => JSON.parse(JSON.stringify(S.doPost({ postData: { contents: JSON.stringify(b) } })));
const hook = (b) => post({ action: "testhook", secret: "hook-secret", ...b });
const form = (name, player) => ({ characterName: name, playerName: player, species: "Elf", background: "Sage", className: "Wizard", alignment: "Neutral Good" });
const char = { level: 1, hp: 8, ac: 12, equipment: [], spellSlots: [0, 0, 0, 0, 0, 0, 0, 0, 0] };
const file = (name) => { const f = { name, trashed: false, getName: () => name, setTrashed: (b) => { f.trashed = b; } }; driveFiles.push(f); return f; };
let n = 0; const ok = (name, fn) => { fn(); n++; console.log("  ok  " + name); };

const T = S.upsertDatabaseRow_(form("Testy", "ZZSTRESS_sim1"), char);
const REAL = S.upsertDatabaseRow_(form("Realone", "Erin"), char);

ok("disabled when TEST_HOOK_SECRET is not set", () => {
	assert.strictEqual(hook({ op: "state", name: "Testy", player: "ZZSTRESS_sim1" }).error, "disabled");
});

props.TEST_HOOK_SECRET = "hook-secret";

ok("wrong secret is refused", () => {
	assert.strictEqual(post({ action: "testhook", secret: "nope", op: "state", name: "Testy", player: "ZZSTRESS_sim1" }).error, "disabled");
});

ok("a real player's character can never be touched", () => {
	for (const op of ["state", "draft", "award"]) assert.strictEqual(hook({ op, name: "Realone", player: "Erin", amount: 5, party: "X" }).ok, false);
});

ok("draft + award + publish makes the DM values visible to the player", () => {
	assert.ok(hook({ op: "draft", name: "Testy", player: "ZZSTRESS_sim1", party: "Blue", conditions: "Poisoned", notes: "owes 5gp" }).ok);
	assert.strictEqual(S.pullCharacter_({ id: T.id, token: T.token }).dm.party, "", "draft is not visible yet");
	assert.ok(hook({ op: "award", name: "Testy", player: "ZZSTRESS_sim1", amount: 25, reason: "killed the bandit" }).ok);
	const r = hook({ op: "publish" });
	assert.deepStrictEqual([r.ok, r.characters, r.awards], [true, 1, 1]);
	const dm = S.pullCharacter_({ id: T.id, token: T.token }).dm;
	assert.deepStrictEqual([dm.party, dm.conditions, dm.notes, dm.version], ["Blue", "Poisoned", "owes 5gp", 1]);
	assert.strictEqual(S.leaderboardData_().awards.length, 1);
});

ok("publish is refused when a real DM draft is pending", () => {
	const chars = S.getCharactersSheet_();
	const H = chars.getRange(1, 1, 1, chars.getLastColumn()).getValues()[0];
	for (let r = 2; r <= chars.getLastRow(); r++) if (chars.cell(r, 1) === REAL.id) chars.set(r, H.indexOf("Party") + 1, "Secret plan");
	const res = hook({ op: "publish" });
	assert.strictEqual(res.ok, false); assert.match(res.error, /non-test/);
	assert.strictEqual(S.pullCharacter_({ id: REAL.id, token: REAL.token }).dm.party, "");
});

ok("cleanup removes only test rows and test files", () => {
	const mine = file("Testy - ZZSTRESS_sim1.md"), pdf = file("Testy - ZZSTRESS_sim1.pdf"), real = file("Realone - Erin.md");
	const res = hook({ op: "cleanup" });
	assert.deepStrictEqual([res.ok, res.characters, res.published, res.awards, res.driveFiles], [true, 1, 1, 1, 2]);
	assert.deepStrictEqual([mine.trashed, pdf.trashed, real.trashed], [true, true, false]);
	assert.strictEqual(S.getCharactersSheet_().getLastRow(), 2);
	assert.strictEqual(S.pullCharacter_({ id: REAL.id, token: REAL.token }).ok !== false, true);
});

console.log(n + " checks passed");
