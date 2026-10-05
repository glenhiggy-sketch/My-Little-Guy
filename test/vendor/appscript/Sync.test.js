// Local test for Sync.js against an in-memory fake of Sheets / Drive / locks. Not pushed (see .claspignore).
// Run: node Sync.test.js
"use strict";
const fs = require("fs");
const vm = require("vm");
const crypto = require("crypto");
const assert = require("assert");

const { ss, driveFiles, ctx } = require("./test_fakes").makeEnv();
vm.runInContext(fs.readFileSync(__dirname + "/Sync.js", "utf8"), ctx);
const S = vm.runInContext("({upsertDatabaseRow_, pullCharacter_, pushCharacter_, doPost, characterLookup_, leaderboardData_, withSyncComment_, " +
	"wipeCharacterEntriesDryRun, wipeAndRebuildCharacterData, getCharactersSheet_, getAwardsSheet_, getPublishedSheet_, CHARACTERS_HEADERS, ensureTab_})", ctx);
for (const k of ["pullCharacter_", "pushCharacter_", "doPost", "characterLookup_", "leaderboardData_"]) { const f = S[k]; S[k] = (...a) => JSON.parse(JSON.stringify(f(...a))); } // cross-realm objects -> plain
const H = S.CHARACTERS_HEADERS, col = (h) => H.indexOf(h);

const form = (name, player, extra) => Object.assign({ characterName: name, playerName: player, species: "Elf", background: "Sage", className: "Wizard", alignment: "Neutral Good" }, extra);
const char = (level, hp, extra) => Object.assign({ level, hp, ac: 12, subclassName: level >= 3 ? "Evoker" : null, equipment: ["a quarterstaff", "a spellbook"], spellSlots: [2, 0, 0, 0, 0, 0, 0, 0, 0] }, extra);
const rowOf = (id) => { const sh = S.getCharactersSheet_(); for (let r = 2; r <= sh.getLastRow(); r++) if (sh.cell(r, 1) === id) return { r, o: Object.fromEntries(H.map((h, i) => [h, sh.cell(r, i + 1)])) }; };
let n = 0; const ok = (name, fn) => { fn(); n++; console.log("  ok  " + name); };

// ---- 1. a new character gets an id, a token and seeded live values
const a = S.upsertDatabaseRow_(form("Aelen", "Erin"), char(1, 8));
ok("new character: id + token + seeded values", () => {
	assert(a.isNew && /^C[0-9a-f]{10}$/.test(a.id) && a.token.length === 40);
	const r = rowOf(a.id).o;
	assert.strictEqual(r["HP"], 8); assert.strictEqual(r["HP Max"], 8); assert.strictEqual(r["Gold"], 0);
	assert.strictEqual(r["Inventory"], "a quarterstaff\na spellbook");
	assert.deepStrictEqual(JSON.parse(r["Spell Slots"]), { 1: { used: 0, max: 2 } });
});
ok("the .md gets a kadria-sync comment carrying endpoint, id and token", () => {
	const t = S.withSyncComment_("# sheet\n", a);
	const m = t.match(/<!-- kadria-sync (\{.*\}) -->/); assert(m);
	const j = JSON.parse(m[1]); assert.deepStrictEqual([j.v, j.id, j.token, j.endpoint], [1, a.id, a.token, "https://script.google.com/macros/s/AKfycbzpd3dobDjH70Nr9mHKBIlrtUE4HSW8I_rW_se_s5PjX8dCxyCIkCug1UN9M00vhadi/exec"]);
});

// ---- 2. resubmission keeps id/token; higher level wins; lower level never downgrades
const b = S.upsertDatabaseRow_(form("aelen", "ERIN"), char(5, 30));
ok("resubmit at higher level (case-insensitive match): same id/token, level up, HP clamped to new max", () => {
	assert(!b.isNew && b.id === a.id && b.token === a.token);
	const r = rowOf(a.id).o; assert.strictEqual(r["Level"], 5); assert.strictEqual(r["HP Max"], 30); assert.strictEqual(r["HP"], 8); assert.strictEqual(r["Older Versions"], "L1");
});
S.upsertDatabaseRow_(form("Aelen", "Erin"), char(2, 12));
ok("resubmit at LOWER level: live row untouched, noted in Older Versions", () => {
	const r = rowOf(a.id).o; assert.strictEqual(r["Level"], 5); assert.strictEqual(r["HP Max"], 30); assert.strictEqual(r["Older Versions"], "L1, L2");
});
const c = S.upsertDatabaseRow_(form("Brom", "Dan"), char(1, 10));
ok("different character gets its own id; unnamed characters never merge", () => {
	assert(c.id !== a.id);
	const u1 = S.upsertDatabaseRow_(form("", "Pat"), char(1, 9)), u2 = S.upsertDatabaseRow_(form("", "Pat"), char(1, 9));
	assert(u1.id !== u2.id);
});

// ---- 3. pull: token required; same answer for bad id and bad token
ok("pull rejects a wrong token and an unknown id identically", () => {
	assert.deepStrictEqual(S.pullCharacter_({ id: a.id, token: "nope" }), { ok: false, error: "not found or bad token" });
	assert.deepStrictEqual(S.pullCharacter_({ id: "Cnope", token: a.token }), { ok: false, error: "not found or bad token" });
});
ok("pull returns player-owned live values, no DM draft, no token", () => {
	const p = S.pullCharacter_({ id: a.id, token: a.token });
	assert(p.ok && p.playerOwned.hp === 8 && p.character.level === 5 && p.dm.version === 0);
	assert(!JSON.stringify(p).includes(a.token));
});

// ---- 4. push writes ONLY player-owned fields
ok("push updates player-owned fields and stamps Last Pushed", () => {
	const r = S.pushCharacter_({ id: a.id, token: a.token, fields: { hp: 17, gold: 42.5, inventory: "rope\ntorch" } });
	assert(r.ok && r.updated.join() === "hp,gold,inventory" && r.rejected.length === 0 && r.pushedAt);
	const row = rowOf(a.id).o; assert.strictEqual(row["HP"], 17); assert.strictEqual(row["Gold"], 42.5); assert.strictEqual(row["Inventory"], "rope\ntorch"); assert(row["Last Pushed"] instanceof Date);
});
ok("push cannot write DM-owned or form-owned fields, or garbage", () => {
	const before = JSON.stringify(rowOf(a.id).o);
	const r = S.pushCharacter_({ id: a.id, token: a.token, fields: { party: "X", conditions: "dead", dmNotes: "x", level: 20, token: "evil", hp: -5, gold: "lots", spellSlots: "not json", ac: 500 } });
	assert(r.ok && r.updated.length === 0 && r.rejected.length === 9 && r.pushedAt === null);
	assert.strictEqual(JSON.stringify(rowOf(a.id).o), before);
});
ok("push with a bad token changes nothing", () => {
	const before = JSON.stringify(rowOf(a.id).o);
	assert.strictEqual(S.pushCharacter_({ id: a.id, token: "bad", fields: { hp: 1 } }).ok, false);
	assert.strictEqual(JSON.stringify(rowOf(a.id).o), before);
});
ok("spell slots must be valid JSON of the agreed shape", () => {
	assert.deepStrictEqual(S.pushCharacter_({ id: a.id, token: a.token, fields: { spellSlots: JSON.stringify({ 1: { used: 1, max: 2 } }) } }).updated, ["spellSlots"]);
	assert.strictEqual(S.pushCharacter_({ id: a.id, token: a.token, fields: { spellSlots: JSON.stringify({ 12: { used: 1, max: 2 } }) } }).updated.length, 0);
});
ok("doPost routes push, rejects bad json and unknown actions", () => {
	assert(S.doPost({ postData: { contents: JSON.stringify({ action: "push", id: a.id, token: a.token, fields: { hp: 3 } }) } }).ok);
	assert.strictEqual(S.doPost({ postData: { contents: "{" } }).error, "bad json");
	assert.strictEqual(S.doPost({ postData: { contents: JSON.stringify({ action: "wipe" }) } }).error, "unknown action");
});

// ---- 5. DM draft vs published
ok("DM draft cells are invisible to pull until a Published row exists", () => {
	const sh = S.getCharactersSheet_(), r = rowOf(a.id).r;
	sh.set(r, col("DM Notes") + 1, "secret plot"); sh.set(r, col("Party") + 1, "Blue"); sh.set(r, col("Conditions") + 1, "poisoned");
	let p = S.pullCharacter_({ id: a.id, token: a.token }); assert.deepStrictEqual([p.dm.notes, p.dm.party, p.dm.version], ["", "", 0]);
	S.getPublishedSheet_().appendRow([a.id, "Blue", "poisoned", "", 1, new Date()]);
	p = S.pullCharacter_({ id: a.id, token: a.token }); assert.deepStrictEqual([p.dm.notes, p.dm.party, p.dm.conditions, p.dm.version], ["", "Blue", "poisoned", 1]);
});

// ---- 6. lookup + leaderboard (Discord, read-only)
ok("lookup: bad secret and no match look identical; match returns published party only", () => {
	assert.deepStrictEqual(S.characterLookup_({ name: "Aelen", player: "Erin", secret: "wrong" }), { found: false });
	assert.deepStrictEqual(S.characterLookup_({ name: "Nobody", player: "Erin", secret: "s3cret" }), { found: false });
	const l = S.characterLookup_({ name: "AELEN", player: "erin", secret: "s3cret" });
	assert(l.found && l.level === 5 && l.party === "Blue" && l.id === a.id && !JSON.stringify(l).includes(a.token));
});
ok("leaderboard counts only Published awards, grouped by published party", () => {
	const aw = S.getAwardsSheet_();
	aw.appendRow(["A1", new Date(), "Aelen", "Erin", 100, "session 1", "Published", new Date()]);
	aw.appendRow(["A2", new Date(), "Aelen", "Erin", 50, "session 2", "Published", new Date()]);
	aw.appendRow(["", new Date(), "Aelen", "Erin", 999, "unpublished draft", "Draft", ""]);
	aw.appendRow(["A3", new Date(), "Brom", "Dan", 70, "no party yet", "Published", new Date()]);
	const lb = S.leaderboardData_();
	assert.strictEqual(lb.awards.length, 3);
	assert.deepStrictEqual(lb.parties.map((p) => [p.party, p.total]), [["Blue", 150]]);
	assert.strictEqual(lb.parties[0].characters[0].character, "Aelen");
});

// ---- 7. the wipe: dry run changes nothing; real run clears entries, keeps scaffolding
ok("wipe dry run reports but changes nothing", () => {
	ss.insertSheet("Character Database").appendRow(["old header"]); ss.sheets["Character Database"].appendRow(["old row"]);
	ss.insertSheet("Submissions").appendRow(["Timestamp"]); ss.sheets["Submissions"].appendRow([new Date(), "x"]);
	driveFiles.push({ getName: () => "Aelen - Erin.md", setTrashed() { this.t = true; } }, { getName: () => "Aelen - Erin.pdf", setTrashed() { this.t = true; } },
		{ getName: () => "My Little Guy - Install Instructions.pdf", setTrashed() { this.t = true; } }, { getName: () => "desktop.ini", setTrashed() { this.t = true; } });
	const rep = S.wipeCharacterEntriesDryRun();
	assert.strictEqual(rep.driveFilesTrashed, 2); assert(!driveFiles.some((f) => f.t)); assert(ss.getSheetByName("Character Database")); assert(S.getCharactersSheet_().getLastRow() > 1);
});
ok("wipe: Drive character files trashed (instructions + other files kept), legacy tab gone, tabs empty with headers", () => {
	S.wipeAndRebuildCharacterData();
	assert.deepStrictEqual(driveFiles.map((f) => !!f.t), [true, true, false, false]);
	assert.strictEqual(ss.getSheetByName("Character Database"), null);
	["Characters", "Published", "Gold Awards"].forEach((nme) => { const sh = ss.getSheetByName(nme); assert(sh && sh.getLastRow() === 1, nme); });
	assert.strictEqual(JSON.stringify(ss.getSheetByName("Characters").data[0]), JSON.stringify(H));
	assert.strictEqual(ss.getSheetByName("Submissions").getLastRow(), 1);
});
ok("after the wipe a fresh submission works and old tokens are dead", () => {
	assert.strictEqual(S.pullCharacter_({ id: a.id, token: a.token }).ok, false);
	const f = S.upsertDatabaseRow_(form("Aelen", "Erin"), char(1, 8)); assert(f.isNew && f.id !== a.id);
});
ok("a tab with unexpected headers is refused, not silently misread", () => {
	ss.getSheetByName("Characters").set(1, 3, "Wrong");
	assert.throws(() => S.getCharactersSheet_(), /unexpected headers/);
});
console.log("\n" + n + " checks passed");
