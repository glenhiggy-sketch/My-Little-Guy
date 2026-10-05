// Local test for Publish.js (+ Sync.js) against the shared in-memory fakes. Run: node Publish.test.js
"use strict";
const fs = require("fs");
const vm = require("vm");
const assert = require("assert");
const { ss, ui, ctx } = require("./test_fakes").makeEnv();

vm.runInContext(fs.readFileSync(__dirname + "/Sync.js", "utf8"), ctx);
vm.runInContext(fs.readFileSync(__dirname + "/Publish.js", "utf8"), ctx);
const S = vm.runInContext("({upsertDatabaseRow_, pullCharacter_, leaderboardData_, characterLookup_, onOpen, publishDmChanges, showUnpublishedChanges, addAwardForSelectedCharacter, " +
	"computePublishPlan_, readTable_, getCharactersSheet_, getPublishedSheet_, getAwardsSheet_, CHARACTERS_HEADERS, AWARDS_HEADERS, GOLD_REMINDER})", ctx);
for (const k of ["pullCharacter_", "leaderboardData_", "characterLookup_", "computePublishPlan_"]) { const f = S[k]; S[k] = (...a) => JSON.parse(JSON.stringify(f(...a))); }
const H = S.CHARACTERS_HEADERS;

const form = (name, player) => ({ characterName: name, playerName: player, species: "Elf", background: "Sage", className: "Wizard", alignment: "Neutral Good" });
const char = (level, hp) => ({ level, hp, ac: 12, equipment: [], spellSlots: [0, 0, 0, 0, 0, 0, 0, 0, 0] });
const A = S.upsertDatabaseRow_(form("Aelen", "Erin"), char(3, 20));
const B = S.upsertDatabaseRow_(form("Brom", "Dan"), char(1, 10));
const chars = S.getCharactersSheet_(), awards = S.getAwardsSheet_(), pubs = S.getPublishedSheet_();
const rowNo = (id) => { for (let r = 2; r <= chars.getLastRow(); r++) if (chars.cell(r, 1) === id) return r; };
const setDm = (id, field, v) => chars.set(rowNo(id), H.indexOf(field) + 1, v);
const award = (name, player, amount, reason, extra) => awards.appendRow(["", extra && extra.date || "", name, player, amount, reason, extra && extra.status || "", ""]);
const lastAlert = () => ui.alerts[ui.alerts.length - 1];
let n = 0; const ok = (name, fn) => { fn(); n++; console.log("  ok  " + name); };

ok("onOpen adds the Kadria menu with Publish first", () => {
	S.onOpen();
	assert.strictEqual(ui.menu.name, "Kadria");
	assert.deepStrictEqual(ui.menu.items.map((i) => i[1]), ["publishDmChanges", "showUnpublishedChanges", "addAwardForSelectedCharacter", "showHowItWorks"]);
});

ok("nothing drafted: plan is empty and Publish says so, writing nothing", () => {
	const p = S.computePublishPlan_(S.readTable_(chars), S.readTable_(pubs), S.readTable_(awards));
	assert.deepStrictEqual([p.changes.length, p.awards.length, p.errors.length], [0, 0, 0]);
	S.publishDmChanges(); assert.strictEqual(lastAlert().title, "Nothing to publish"); assert.strictEqual(pubs.getLastRow(), 1);
});

ok("a draft is detected, listed, and NOT visible to players or Discord yet", () => {
	setDm(A.id, "Party", "Blue"); setDm(A.id, "DM Notes", "owes the guild 5gp");
	const p = S.computePublishPlan_(S.readTable_(chars), S.readTable_(pubs), S.readTable_(awards));
	assert.strictEqual(p.changes.length, 1); assert.deepStrictEqual(p.changes[0].diffs.map((d) => d.field), ["Party", "DM Notes"]);
	const pull = S.pullCharacter_({ id: A.id, token: A.token }); assert.deepStrictEqual([pull.dm.party, pull.dm.notes, pull.dm.version], ["", "", 0]);
	assert.strictEqual(S.characterLookup_({ name: "Aelen", player: "Erin", secret: "s3cret" }).party, "");
});

ok("answering NO to the confirmation publishes nothing", () => {
	ui.answer = "NO"; S.publishDmChanges();
	assert.strictEqual(lastAlert().title, "Publish DM changes?");
	assert.strictEqual(pubs.getLastRow(), 1);
	assert.strictEqual(S.pullCharacter_({ id: A.id, token: A.token }).dm.party, "");
});

ok("the confirmation says it changes the sheet and players will see it, and lists who", () => {
	const msg = lastAlert().msg;
	assert(/This will change the character sheets, and players will see it/.test(msg), msg);
	assert(msg.includes("Aelen (Erin): Party, DM Notes"), msg);
	assert(!msg.includes("Reminder: gold awarded"), "no gold reminder when there are no awards");
});

ok("a gold award adds the reminder copy to the confirmation", () => {
	award("Aelen", "Erin", 100, "session 1"); ui.answer = "NO"; S.publishDmChanges();
	const msg = lastAlert().msg;
	assert(msg.includes("+100 to Aelen (session 1)") && msg.includes(S.GOLD_REMINDER) && /Discord will announce/.test(msg), msg);
	assert(/update their own gold and inventory in My Little Guy/.test(msg));
});

ok("any bad row blocks the whole publish: nothing is written, errors are listed", () => {
	award("Aelen", "Erin", 0, "zero"); award("", "Erin", 5, "no name"); award("Nobody", "Erin", 5, "unknown"); award("Brom", "Dan", "lots", "text amount");
	ui.answer = "YES"; S.publishDmChanges();
	assert.strictEqual(lastAlert().title, "Fix these before publishing");
	const msg = lastAlert().msg;
	assert(/row 3: Amount must be a non-zero number/.test(msg) && /row 4: needs a Character Name/.test(msg) && /row 5: no character "Nobody"/.test(msg) && /row 6: Amount must be/.test(msg), msg);
	assert.strictEqual(pubs.getLastRow(), 1); assert.strictEqual(awards.cell(2, 1), ""); assert.strictEqual(awards.cell(2, 7), "");
	// remove the bad rows (rows 3..6) so the valid draft remains
	awards.data.splice(2, 4);
});

ok("YES publishes: Published rows + version, Characters shows the version, awards get ids", () => {
	ui.answer = "YES"; S.publishDmChanges();
	assert.strictEqual(lastAlert().title, "Published");
	assert(/1 character update\(s\) and 1 gold award\(s\)/.test(lastAlert().msg));
	const p = S.readTable_(pubs); assert.deepStrictEqual([p.rows[0][0], p.rows[0][1], p.rows[0][3], p.rows[0][4]], [A.id, "Blue", "owes the guild 5gp", 1]);
	assert.strictEqual(chars.cell(rowNo(A.id), H.indexOf("Published Version") + 1), 1);
	assert.deepStrictEqual([awards.cell(2, 1), awards.cell(2, 7)], ["A0001", "Published"]);
	assert(awards.cell(2, 2) instanceof Date && awards.cell(2, 8) instanceof Date, "date + published-at stamped");
});

ok("now players and Discord see the published values", () => {
	const pull = S.pullCharacter_({ id: A.id, token: A.token });
	assert.deepStrictEqual([pull.dm.party, pull.dm.notes, pull.dm.version], ["Blue", "owes the guild 5gp", 1]);
	assert.deepStrictEqual(pull.awards.map((a) => [a.id, a.amount, a.reason]), [["A0001", 100, "session 1"]]);
	assert.strictEqual(S.characterLookup_({ name: "Aelen", player: "Erin", secret: "s3cret" }).party, "Blue");
	const lb = S.leaderboardData_(); assert.deepStrictEqual(lb.parties.map((p) => [p.party, p.total]), [["Blue", 100]]); assert.strictEqual(lb.awards[0].id, "A0001");
});

ok("publishing again with no edits does nothing; editing again bumps the version", () => {
	S.publishDmChanges(); assert.strictEqual(lastAlert().title, "Nothing to publish");
	setDm(A.id, "Conditions", "poisoned"); ui.answer = "YES"; S.publishDmChanges();
	assert.strictEqual(S.readTable_(pubs).rows[0][4], 2);
	assert.strictEqual(S.pullCharacter_({ id: A.id, token: A.token }).dm.conditions, "poisoned");
});

ok("award ids keep counting and a second character can be published with its own row", () => {
	award("Brom", "Dan", 40, "found a chest"); setDm(B.id, "Party", "Blue"); ui.answer = "YES"; S.publishDmChanges();
	assert.strictEqual(awards.cell(3, 1), "A0002"); assert.strictEqual(S.readTable_(pubs).rows.length, 2);
	const lb = S.leaderboardData_(); assert.deepStrictEqual(lb.parties.map((p) => [p.party, p.total]), [["Blue", 140]]);
});

ok("showUnpublishedChanges lists drafts without applying them", () => {
	setDm(B.id, "DM Notes", "wants a horse"); const before = pubs.getLastRow();
	S.showUnpublishedChanges(); assert(/Brom \(Dan\): DM Notes/.test(lastAlert().msg)); assert.strictEqual(pubs.getLastRow(), before);
	assert.strictEqual(S.pullCharacter_({ id: B.id, token: B.token }).dm.notes, "");
});

ok("add award for the selected character writes a Draft row; bad input writes nothing", () => {
	ss.active = chars; chars.activeRange = chars.getRange(rowNo(B.id), 1, 1, 1);
	const rows = awards.getLastRow();
	ui.promptAnswers = ["25", "bounty"]; S.addAwardForSelectedCharacter();
	assert.strictEqual(awards.getLastRow(), rows + 1);
	const r = awards.data[awards.getLastRow() - 1]; assert.deepStrictEqual([r[2], r[3], r[4], r[5], r[6]], ["Brom", "Dan", 25, "bounty", "Draft"]);
	ui.promptAnswers = ["abc"]; S.addAwardForSelectedCharacter(); assert.strictEqual(awards.getLastRow(), rows + 1);
	ss.active = awards; S.addAwardForSelectedCharacter(); assert.strictEqual(lastAlert().title, "Select a character");
	ss.active = chars;
});

ok("a Draft award counts toward nothing until published", () => {
	assert.strictEqual(S.leaderboardData_().parties[0].total, 140);
	ui.answer = "YES"; S.publishDmChanges();
	assert.strictEqual(S.leaderboardData_().parties[0].total, 165);
});

console.log("\n" + n + " checks passed");
