/**
 * Test-only "simulated DM" for the end-user simulations (My Little Guy repo, sim/).
 *
 * DISABLED unless the TEST_HOOK_SECRET script property exists and the caller sends it (Apps Script editor >
 * Project Settings > Script Properties). And even when enabled it can ONLY touch test data: characters whose
 * Player Name starts with "ZZSTRESS_". Publishing is refused if the pending plan includes anything else, so it
 * can never publish a real DM's drafts or award real gold.
 *
 * POST (JSON, text/plain) {action:"testhook", secret, op, ...}
 *   op "draft"    {name, player, party?, conditions?, notes?}   set the DM-owned DRAFT cells of a test character
 *   op "award"    {name, player, amount, reason?}               add a Draft row on Gold Awards
 *   op "publish"                                                publish drafts + awards (test data only)
 *   op "state"    {name, player}                                read back a test character's row, draft and published values
 *   op "cleanup"                                                delete every test character/award/log row and trash their Drive files
 */
const TEST_PLAYER_PREFIX = "ZZSTRESS_";

function isTestPlayer_(p) { return String(p || "").indexOf(TEST_PLAYER_PREFIX) === 0; }

function testHook_(body) {
	const expected = PropertiesService.getScriptProperties().getProperty("TEST_HOOK_SECRET");
	if (!expected || !safeEqual_(body.secret || "", expected)) return jsonOutput_({ ok: false, error: "disabled" });
	const lock = LockService.getScriptLock();
	lock.waitLock(30000);
	try {
		if (body.op === "draft") return jsonOutput_(testDraft_(body));
		if (body.op === "award") return jsonOutput_(testAward_(body));
		if (body.op === "publish") return jsonOutput_(testPublish_());
		if (body.op === "state") return jsonOutput_(testState_(body));
		if (body.op === "cleanup") return jsonOutput_(testCleanup_());
		return jsonOutput_({ ok: false, error: "unknown op" });
	} finally {
		lock.releaseLock();
	}
}

function findTestRow_(sheet, t, name, player) {
	if (!isTestPlayer_(player)) return -1;
	for (let i = 0; i < t.rows.length; i++) {
		if (norm_(t.rows[i][t.idx["Character Name"]]) === norm_(name) && norm_(t.rows[i][t.idx["Player Name"]]) === norm_(player)) return i;
	}
	return -1;
}

function testDraft_(b) {
	const sheet = getCharactersSheet_(), t = readTable_(sheet);
	const i = findTestRow_(sheet, t, b.name, b.player);
	if (i < 0) return { ok: false, error: "no such test character" };
	const set = { Party: b.party, Conditions: b.conditions, "DM Notes": b.notes };
	Object.keys(set).forEach(function (h) {
		if (set[h] !== undefined) sheet.getRange(i + 2, t.idx[h] + 1).setValue(String(set[h]));
	});
	return { ok: true };
}

function testAward_(b) {
	const t = readTable_(getCharactersSheet_());
	if (findTestRow_(null, t, b.name, b.player) < 0) return { ok: false, error: "no such test character" };
	const amount = Number(b.amount);
	if (!isFinite(amount) || amount === 0) return { ok: false, error: "bad amount" };
	getAwardsSheet_().appendRow(["", new Date(), String(b.name), String(b.player), amount, String(b.reason || ""), "Draft", ""]);
	return { ok: true };
}

function testPublish_() {
	const plan = currentPlan_();
	if (plan.errors.length) return { ok: false, error: "plan has errors: " + plan.errors.join("; ") };
	const foreign = plan.changes.filter(function (c) { return !isTestPlayer_(c.player); }).length +
		plan.awards.filter(function (a) { return !isTestPlayer_(a.player); }).length;
	if (foreign) return { ok: false, error: "refused: the pending plan includes non-test data" };
	const r = applyPublishPlan_(plan, new Date());
	return { ok: true, characters: r.characters, awards: r.awards };
}

function testState_(b) {
	const sheet = getCharactersSheet_(), t = readTable_(sheet);
	const i = findTestRow_(sheet, t, b.name, b.player);
	if (i < 0) return { ok: false, error: "no such test character" };
	const o = rowObj_(t, t.rows[i]);
	return {
		ok: true,
		row: { hp: o["HP"], hpMax: o["HP Max"], ac: o["AC"], gold: o["Gold"], inventory: o["Inventory"], spellSlots: o["Spell Slots"], level: o["Level"], class: o["Class"], lastPushed: iso_(o["Last Pushed"]) },
		draft: { party: o["Party"], conditions: o["Conditions"], notes: o["DM Notes"] },
		published: publishedFor_(o["Character ID"]),
	};
}

function deleteMatchingRows_(sheet, predicate) {
	const t = readTable_(sheet);
	let n = 0;
	for (let i = t.rows.length - 1; i >= 0; i--) {
		if (predicate(t, t.rows[i])) { sheet.deleteRow(i + 2); n++; }
	}
	return n;
}

function testCleanup_() {
	const chars = getCharactersSheet_(), ct = readTable_(chars);
	const ids = {};
	ct.rows.forEach(function (r) { if (isTestPlayer_(r[ct.idx["Player Name"]])) ids[String(r[ct.idx["Character ID"]])] = true; });
	const out = {
		characters: deleteMatchingRows_(chars, function (t, r) { return isTestPlayer_(r[t.idx["Player Name"]]); }),
		published: deleteMatchingRows_(getPublishedSheet_(), function (t, r) { return ids[String(r[t.idx["Character ID"]])]; }),
		awards: deleteMatchingRows_(getAwardsSheet_(), function (t, r) { return isTestPlayer_(r[t.idx["Player Name"]]); }),
		submissions: 0,
		driveFiles: 0,
	};
	const subs = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
	if (subs && subs.getLastRow() > 1) out.submissions = deleteMatchingRows_(subs, function (t, r) { return isTestPlayer_(r[t.idx["Player Name"]]); });
	const files = getOrCreateDriveFolder_().getFiles();
	while (files.hasNext()) {
		const f = files.next();
		if (isCharacterFile_(f) && /\s-\sZZSTRESS_[^.]*\.(md|pdf)$/i.test(f.getName())) { f.setTrashed(true); out.driveFiles++; }
	}
	out.ok = true;
	return out;
}
