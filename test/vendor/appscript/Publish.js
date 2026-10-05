/**
 * DM tooling inside the Google Sheet: a "Kadria" menu with Publish.
 *
 * The DM edits Party / Conditions / DM Notes on the Characters tab and types gold awards into the Gold Awards tab.
 * Those are DRAFTS. Players (My Little Guy's pull) and Discord (leaderboard, lookup party) only ever see PUBLISHED
 * values, so nothing reaches them until the DM confirms here.
 *
 * Gold Awards rows the DM fills in: Date (optional), Character Name, Player Name, Amount, Reason. Leave Award ID and
 * Status blank; Publish assigns the id, marks the row Published and stamps the time.
 */

const GOLD_REMINDER = "Reminder: gold awarded here is NOT added to a player's character sheet automatically. Players update their own gold and inventory in My Little Guy.";

function onOpen() {
	SpreadsheetApp.getUi().createMenu("Kadria")
		.addItem("Publish DM changes", "publishDmChanges")
		.addItem("Show unpublished changes", "showUnpublishedChanges")
		.addSeparator()
		.addItem("Add gold award for the selected character", "addAwardForSelectedCharacter")
		.addItem("How this sheet works", "showHowItWorks")
		.addToUi();
}

// ---------------------------------------------------------------- pure planning (unit-tested)

/** Compares the DM's draft cells with what is published and checks the draft awards. Changes nothing. */
function computePublishPlan_(chars, pubs, awards) {
	const pubById = {};
	pubs.rows.forEach(function (r, i) {
		pubById[String(r[pubs.idx["Character ID"]])] = { party: String(r[pubs.idx["Party"]] || ""), conditions: String(r[pubs.idx["Conditions"]] || ""), notes: String(r[pubs.idx["DM Notes"]] || ""), version: Number(r[pubs.idx["Version"]]) || 0, rowNumber: i + 2 };
	});
	const known = {};
	const changes = [];
	chars.rows.forEach(function (r) {
		const id = String(r[chars.idx["Character ID"]] || "");
		if (!id) return;
		const name = String(r[chars.idx["Character Name"]] || ""), player = String(r[chars.idx["Player Name"]] || "");
		known[norm_(name) + "|" + norm_(player)] = true;
		const draft = { Party: String(r[chars.idx["Party"]] || ""), Conditions: String(r[chars.idx["Conditions"]] || ""), "DM Notes": String(r[chars.idx["DM Notes"]] || "") };
		const pub = pubById[id] || { party: "", conditions: "", notes: "", version: 0, rowNumber: 0 };
		const current = { Party: pub.party, Conditions: pub.conditions, "DM Notes": pub.notes };
		const diffs = DM_FIELDS.filter(function (f) { return draft[f] !== current[f]; }).map(function (f) { return { field: f, from: current[f], to: draft[f] }; });
		if (diffs.length) changes.push({ id: id, name: name, player: player, draft: draft, diffs: diffs, version: pub.version, publishedRow: pub.rowNumber });
	});

	const newAwards = [], errors = [];
	awards.rows.forEach(function (r, i) {
		const status = String(r[awards.idx["Status"]] || "").trim();
		if (status === "Published") return;
		const name = String(r[awards.idx["Character Name"]] || "").trim(), player = String(r[awards.idx["Player Name"]] || "").trim();
		const rawAmount = r[awards.idx["Amount"]], reason = String(r[awards.idx["Reason"]] || "").trim();
		if (!name && !player && (rawAmount === "" || rawAmount === null) && !reason) return; // an empty row
		const where = "Gold Awards row " + (i + 2) + ": ";
		const amount = Number(rawAmount);
		if (!name) { errors.push(where + "needs a Character Name"); return; }
		if (rawAmount === "" || rawAmount === null || !isFinite(amount) || amount === 0) { errors.push(where + "Amount must be a non-zero number"); return; }
		if (!known[norm_(name) + "|" + norm_(player)]) { errors.push(where + 'no character "' + name + '" played by "' + player + '" on the Characters tab (check the spelling of both)'); return; }
		newAwards.push({ rowNumber: i + 2, name: name, player: player, amount: amount, reason: reason, date: r[awards.idx["Date"]] || null });
	});
	return { changes: changes, awards: newAwards, errors: errors };
}

function summarizePlan_(plan) {
	const lines = [];
	plan.changes.forEach(function (c) {
		lines.push("- " + c.name + " (" + c.player + "): " + c.diffs.map(function (d) { return d.field; }).join(", "));
	});
	const total = plan.awards.reduce(function (s, a) { return s + a.amount; }, 0);
	plan.awards.forEach(function (a) {
		lines.push("- Gold: " + (a.amount > 0 ? "+" : "") + a.amount + " to " + a.name + (a.reason ? " (" + a.reason + ")" : ""));
	});
	return { text: lines.join("\n"), awardTotal: total };
}

/** Writes the plan. Returns counts. Caller holds the lock. */
function applyPublishPlan_(plan, now) {
	const chars = getCharactersSheet_(), pubSheet = getPublishedSheet_(), awardSheet = getAwardsSheet_();
	const ct = readTable_(chars), at = readTable_(awardSheet);
	plan.changes.forEach(function (c) {
		const version = c.version + 1;
		const row = [c.id, c.draft.Party, c.draft.Conditions, c.draft["DM Notes"], version, now];
		if (c.publishedRow) writeRow_(pubSheet, c.publishedRow, row); else pubSheet.appendRow(row);
		for (let i = 0; i < ct.rows.length; i++) {
			if (String(ct.rows[i][ct.idx["Character ID"]]) === c.id) { chars.getRange(i + 2, ct.idx["Published Version"] + 1).setValue(version); break; }
		}
	});
	let next = 0;
	at.rows.forEach(function (r) {
		const m = /^A(\d+)$/.exec(String(r[at.idx["Award ID"]] || ""));
		if (m) next = Math.max(next, parseInt(m[1], 10));
	});
	plan.awards.forEach(function (a) {
		next++;
		const id = "A" + ("0000" + next).slice(-4);
		awardSheet.getRange(a.rowNumber, at.idx["Award ID"] + 1).setValue(id);
		if (!a.date) awardSheet.getRange(a.rowNumber, at.idx["Date"] + 1).setValue(now);
		awardSheet.getRange(a.rowNumber, at.idx["Status"] + 1).setValue("Published");
		awardSheet.getRange(a.rowNumber, at.idx["Published At"] + 1).setValue(now);
	});
	return { characters: plan.changes.length, awards: plan.awards.length };
}

// ---------------------------------------------------------------- menu handlers

function currentPlan_() {
	return computePublishPlan_(readTable_(getCharactersSheet_()), readTable_(getPublishedSheet_()), readTable_(getAwardsSheet_()));
}

function showUnpublishedChanges() {
	const ui = SpreadsheetApp.getUi();
	const plan = currentPlan_();
	if (plan.errors.length) { ui.alert("Fix these before publishing", plan.errors.join("\n"), ui.ButtonSet.OK); return; }
	if (!plan.changes.length && !plan.awards.length) { ui.alert("Nothing to publish", "Everything players can see matches what is on the sheet.", ui.ButtonSet.OK); return; }
	ui.alert("Unpublished changes (players cannot see these yet)", summarizePlan_(plan).text, ui.ButtonSet.OK);
}

function publishDmChanges() {
	const ui = SpreadsheetApp.getUi();
	const lock = LockService.getScriptLock();
	lock.waitLock(30000);
	try {
		const plan = currentPlan_();
		if (plan.errors.length) { ui.alert("Fix these before publishing", plan.errors.join("\n"), ui.ButtonSet.OK); return; }
		if (!plan.changes.length && !plan.awards.length) { ui.alert("Nothing to publish", "Everything players can see matches what is on the sheet.", ui.ButtonSet.OK); return; }
		const s = summarizePlan_(plan);
		const msg = "This will change the character sheets, and players will see it.\n\n" + s.text + "\n\n" +
			(plan.awards.length ? "Discord will announce the gold awards and update the leaderboard.\n" + GOLD_REMINDER + "\n\n" : "") +
			"Players get this the next time they open the character or press Get from sheet.\n\nPublish now?";
		if (ui.alert("Publish DM changes?", msg, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
		const r = applyPublishPlan_(plan, new Date());
		ui.alert("Published", r.characters + " character update(s) and " + r.awards + " gold award(s) are now live.", ui.ButtonSet.OK);
	} finally {
		lock.releaseLock();
	}
}

/** Adds a Draft award row for the character whose row is selected on the Characters tab. */
function addAwardForSelectedCharacter() {
	const ui = SpreadsheetApp.getUi();
	const sheet = SpreadsheetApp.getActiveSheet();
	if (!sheet || sheet.getName() !== CHARACTERS_SHEET_NAME || !sheet.getActiveRange() || sheet.getActiveRange().getRow() < 2) {
		ui.alert("Select a character", "Click a character's row on the Characters tab first.", ui.ButtonSet.OK);
		return;
	}
	const t = readTable_(sheet), row = t.rows[sheet.getActiveRange().getRow() - 2];
	const name = row[t.idx["Character Name"]], player = row[t.idx["Player Name"]];
	const a = ui.prompt("Gold award for " + name, "Amount (a number; negative to take gold away):", ui.ButtonSet.OK_CANCEL);
	if (a.getSelectedButton() !== ui.Button.OK) return;
	const amount = Number(a.getResponseText());
	if (!isFinite(amount) || amount === 0) { ui.alert("Not a valid amount", "Enter a non-zero number.", ui.ButtonSet.OK); return; }
	const why = ui.prompt("Reason", "What is it for?", ui.ButtonSet.OK_CANCEL);
	if (why.getSelectedButton() !== ui.Button.OK) return;
	getAwardsSheet_().appendRow(["", new Date(), name, player, amount, why.getResponseText(), "Draft", ""]);
	ui.alert("Added as a draft", "It is on the Gold Awards tab. Players and Discord see it after Kadria > Publish DM changes.", ui.ButtonSet.OK);
}

function showHowItWorks() {
	SpreadsheetApp.getUi().alert("How this sheet works",
		"Yellow columns (Party, Conditions, DM Notes) and the Gold Awards tab are yours. Edits there are DRAFTS until you use Kadria > Publish DM changes.\n\n" +
		"Blue columns (HP, HP Max, AC, Gold, Inventory, Spell Slots) belong to the player and are written by My Little Guy's Send to sheet. Don't edit them.\n\n" +
		"Level, class and species change only when the player resubmits the Character Intake form.", SpreadsheetApp.getUi().ButtonSet.OK);
}
