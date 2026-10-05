/**
 * Kadria Character Intake: the Google Sheet is the single source of truth for table-side character data.
 *
 * TABS
 *  - Characters   one row per character (see CHARACTERS_HEADERS). Three groups of columns:
 *                 form-owned identity (written by the intake form), player-owned live values (written only by the
 *                 token-checked `push`), DM-owned values (Party, Conditions, DM Notes) which are DRAFTS until a
 *                 DM publishes them.
 *  - Published    the snapshot of DM-owned values that players' `pull` can see.
 *  - Gold Awards  DM-owned ledger of awards (Draft until published); the leaderboard counts Published rows only.
 *  - Submissions  the raw form log (unchanged).
 *
 * ENDPOINTS (web app)
 *  GET  ?action=lookup      &name &player &secret   -> Discord link check (read-only)
 *  GET  ?action=leaderboard &secret                 -> party totals + recent published awards (read-only, for the bot)
 *  GET  ?action=pull        &id &token              -> player-owned live values + DM-owned PUBLISHED values + awards
 *  POST (JSON, text/plain)  {action:"push", id, token, fields:{...}} -> writes ONLY player-owned fields
 *
 * Nothing in here lets Discord or a player write DM-owned fields, and nothing lets the DM-owned draft leak
 * to players before it is published.
 */

const CHARACTERS_SHEET_NAME = "Characters";
const PUBLISHED_SHEET_NAME = "Published";
const AWARDS_SHEET_NAME = "Gold Awards";
const LEGACY_DATABASE_SHEET_NAME = "Character Database"; // replaced by "Characters"; removed by the wipe
const INSTALL_INSTRUCTIONS_FILENAME = "My Little Guy - Install Instructions.pdf";

const CHARACTERS_HEADERS = [
	"Character ID", "Character Name", "Player Name", "Species", "Background", "Class", "Subclass", "Level", "Alignment",
	"HP", "HP Max", "AC", "Gold", "Inventory", "Spell Slots",
	"Party", "Conditions", "DM Notes",
	"Sheet File", "Token", "Older Versions", "Last Updated", "Last Pushed", "Published Version",
];
const PLAYER_FIELDS = ["HP", "HP Max", "AC", "Gold", "Inventory", "Spell Slots"];
const DM_FIELDS = ["Party", "Conditions", "DM Notes"];
const PUBLISHED_HEADERS = ["Character ID", "Party", "Conditions", "DM Notes", "Version", "Published At"];
const AWARDS_HEADERS = ["Award ID", "Date", "Character Name", "Player Name", "Amount", "Reason", "Status", "Published At"];

// ---------------------------------------------------------------- small helpers

function norm_(v) { return String(v === null || v === undefined ? "" : v).trim().toLowerCase(); }

function safeEqual_(a, b) {
	a = String(a || ""); b = String(b || "");
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

function newCharacterId_() { return "C" + Utilities.getUuid().replace(/-/g, "").slice(0, 10); }
function newToken_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "").slice(0, 40); }

function iso_(d) { return d ? new Date(d).toISOString() : ""; }

// The production web-app URL players' files point at. Not a secret (it is also the intake form's URL). Overridable
// with a SYNC_ENDPOINT script property; never ScriptApp.getService().getUrl(), which can return a /dev URL.
const SYNC_ENDPOINT_DEFAULT = "https://script.google.com/macros/s/AKfycbzpd3dobDjH70Nr9mHKBIlrtUE4HSW8I_rW_se_s5PjX8dCxyCIkCug1UN9M00vhadi/exec";
function syncEndpoint_() {
	return PropertiesService.getScriptProperties().getProperty("SYNC_ENDPOINT") || SYNC_ENDPOINT_DEFAULT;
}

/** The line appended to every character's .md so My Little Guy knows where and as whom to sync. */
function syncComment_(id, token) {
	return "<!-- kadria-sync " + JSON.stringify({ v: 1, endpoint: syncEndpoint_(), id: id, token: token }) + " -->";
}

function withSyncComment_(text, info) {
	if (!info || !info.id || !info.token) return text;
	return String(text).replace(/\s*$/, "") + "\n\n" + syncComment_(info.id, info.token) + "\n";
}

// ---------------------------------------------------------------- tabs

/** Gets or creates a tab with exactly these headers. Refuses to touch a tab whose headers differ. */
function ensureTab_(name, headers) {
	const ss = SpreadsheetApp.getActiveSpreadsheet();
	let sheet = ss.getSheetByName(name);
	if (!sheet) {
		sheet = ss.insertSheet(name);
		sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
		sheet.setFrozenRows(1);
		sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
		return sheet;
	}
	const have = sheet.getRange(1, 1, 1, Math.max(headers.length, sheet.getLastColumn() || 1)).getValues()[0];
	for (let i = 0; i < headers.length; i++) {
		if (String(have[i]) !== headers[i]) {
			throw new Error('Tab "' + name + '" has unexpected headers (column ' + (i + 1) + ' is "' + have[i] + '", expected "' + headers[i] +
				'"). Run wipeAndRebuildCharacterData() from the Apps Script editor to reset the scaffolding.');
		}
	}
	return sheet;
}

function getCharactersSheet_() { return ensureTab_(CHARACTERS_SHEET_NAME, CHARACTERS_HEADERS); }
function getPublishedSheet_() { return ensureTab_(PUBLISHED_SHEET_NAME, PUBLISHED_HEADERS); }
function getAwardsSheet_() { return ensureTab_(AWARDS_SHEET_NAME, AWARDS_HEADERS); }

/** Reads a whole tab as { headers, idx: {header: columnIndex}, rows: [[...]] }. */
function readTable_(sheet) {
	const values = sheet.getDataRange().getValues();
	const headers = values[0] || [];
	const idx = {};
	headers.forEach(function (h, i) { idx[h] = i; });
	return { headers: headers, idx: idx, rows: values.slice(1) };
}

function writeRow_(sheet, rowNumber, row) {
	sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
}

function rowObj_(t, row) {
	const o = {};
	t.headers.forEach(function (h, i) { o[h] = row[i]; });
	return o;
}

/** Finds a character by id + token. Same null for "no such id" and "wrong token". */
function authCharacter_(t, id, token) {
	id = String(id || ""); token = String(token || "");
	if (!id || !token) return null;
	for (let i = 0; i < t.rows.length; i++) {
		if (String(t.rows[i][t.idx["Character ID"]]) === id) {
			return safeEqual_(t.rows[i][t.idx["Token"]], token) ? { rowNumber: i + 2, index: i, row: t.rows[i] } : null;
		}
	}
	return null;
}

// ---------------------------------------------------------------- spell slots / inventory

/** character.spellSlots is an array of 9 maxima (level 1..9). Stored as {"1":{"used":0,"max":2},...}. */
function slotsToJson_(slots) {
	const out = {};
	(Array.isArray(slots) ? slots : []).forEach(function (max, i) {
		const m = Number(max) || 0;
		if (m > 0) out[String(i + 1)] = { used: 0, max: m };
	});
	return JSON.stringify(out);
}

function validSlotsJson_(s) {
	if (typeof s !== "string" || s.length > 600) return false;
	let o;
	try { o = JSON.parse(s); } catch (e) { return false; }
	if (!o || typeof o !== "object" || Array.isArray(o)) return false;
	return Object.keys(o).every(function (k) {
		const v = o[k];
		return /^[1-9]$/.test(k) && v && Number.isInteger(v.used) && Number.isInteger(v.max) && v.used >= 0 && v.max >= 0 && v.max <= 99 && v.used <= 99;
	});
}

// ---------------------------------------------------------------- the form writes identity (and seeds the live values)

/** Replaces the old Character Database upsert. Called once per successful submission/import.
 *  Returns { id, token, isNew }. A resubmission keeps the character's id and token (so the player's
 *  existing file keeps syncing) and never lowers the live level (highest level wins, as before). */
function upsertDatabaseRow_(formData, character) {
	const lock = LockService.getScriptLock();
	lock.waitLock(30000);
	try {
		const sheet = getCharactersSheet_();
		const t = readTable_(sheet);
		const I = t.idx;
		const name = String(formData.characterName || "").trim();
		const player = String(formData.playerName || "").trim();
		const level = character.level || 1;
		const now = new Date();
		const hpMax = Number(character.hp) || 0;

		let match = -1;
		if (name) {
			for (let i = 0; i < t.rows.length; i++) {
				if (norm_(t.rows[i][I["Character Name"]]) === norm_(name) && norm_(t.rows[i][I["Player Name"]]) === norm_(player)) { match = i; break; }
			}
		}

		const identity = {
			"Character Name": name, "Player Name": player, "Species": formData.species || "", "Background": formData.background || "",
			"Class": formData.className || "", "Subclass": character.subclassName || "", "Level": level, "Alignment": formData.alignment || "",
		};

		if (match === -1) {
			const row = CHARACTERS_HEADERS.map(function () { return ""; });
			const id = newCharacterId_(), token = newToken_();
			Object.keys(identity).forEach(function (k) { row[I[k]] = identity[k]; });
			row[I["Character ID"]] = id;
			row[I["Token"]] = token;
			row[I["HP"]] = hpMax; row[I["HP Max"]] = hpMax; row[I["AC"]] = Number(character.ac) || 0; row[I["Gold"]] = 0;
			row[I["Inventory"]] = (character.equipment || []).join("\n");
			row[I["Spell Slots"]] = slotsToJson_(character.spellSlots);
			row[I["Last Updated"]] = now;
			sheet.appendRow(row);
			return { id: id, token: token, isNew: true };
		}

		const row = t.rows[match].slice();
		while (row.length < CHARACTERS_HEADERS.length) row.push("");
		let id = String(row[I["Character ID"]] || ""), token = String(row[I["Token"]] || "");
		if (!id) { id = newCharacterId_(); row[I["Character ID"]] = id; }
		if (!token) { token = newToken_(); row[I["Token"]] = token; }
		const existingLevel = Number(row[I["Level"]]) || 0;
		const older = String(row[I["Older Versions"]] || "");
		if (level >= existingLevel) {
			Object.keys(identity).forEach(function (k) { row[I[k]] = identity[k]; });
			row[I["Older Versions"]] = older ? older + ", L" + existingLevel : "L" + existingLevel;
			row[I["HP Max"]] = hpMax;
			row[I["HP"]] = Math.min(Number(row[I["HP"]]) || hpMax, hpMax); // keep the player's current HP, never above the new max
			row[I["AC"]] = Number(character.ac) || 0;
			row[I["Spell Slots"]] = slotsToJson_(character.spellSlots);
		} else {
			row[I["Older Versions"]] = older ? older + ", L" + level : "L" + level;
		}
		row[I["Last Updated"]] = now;
		writeRow_(sheet, match + 2, row);
		return { id: id, token: token, isNew: false };
	} finally {
		lock.releaseLock();
	}
}

/** Records the Drive URL of a character's .md on its row (best effort). */
function setSheetFileUrl_(id, url) {
	if (!id || !url) return;
	try {
		const sheet = getCharactersSheet_();
		const t = readTable_(sheet);
		for (let i = 0; i < t.rows.length; i++) {
			if (String(t.rows[i][t.idx["Character ID"]]) === String(id)) {
				sheet.getRange(i + 2, t.idx["Sheet File"] + 1).setValue(url);
				return;
			}
		}
	} catch (e) {
		Logger.log("Kadria: could not record sheet file url: " + (e && e.message ? e.message : e));
	}
}

// ---------------------------------------------------------------- published DM values + awards (read side)

function publishedFor_(id) {
	const t = readTable_(getPublishedSheet_());
	for (let i = 0; i < t.rows.length; i++) {
		if (String(t.rows[i][t.idx["Character ID"]]) === String(id)) {
			return {
				party: String(t.rows[i][t.idx["Party"]] || ""), conditions: String(t.rows[i][t.idx["Conditions"]] || ""),
				notes: String(t.rows[i][t.idx["DM Notes"]] || ""), version: Number(t.rows[i][t.idx["Version"]]) || 0,
				publishedAt: iso_(t.rows[i][t.idx["Published At"]]),
			};
		}
	}
	return { party: "", conditions: "", notes: "", version: 0, publishedAt: "" };
}

function publishedAwards_() {
	const t = readTable_(getAwardsSheet_());
	return t.rows.filter(function (r) { return String(r[t.idx["Status"]]) === "Published"; }).map(function (r) {
		return {
			id: String(r[t.idx["Award ID"]] || ""), date: iso_(r[t.idx["Date"]]), character: String(r[t.idx["Character Name"]] || ""),
			player: String(r[t.idx["Player Name"]] || ""), amount: Number(r[t.idx["Amount"]]) || 0, reason: String(r[t.idx["Reason"]] || ""),
		};
	});
}

// ---------------------------------------------------------------- endpoints

function lookupSecretOk_(params) {
	const expected = PropertiesService.getScriptProperties().getProperty("LOOKUP_SECRET");
	return !!expected && safeEqual_(params.secret || "", expected);
}

/** Read-only link check for the Discord bot. Same {found:false} for a bad secret and for no match. */
function characterLookup_(params) {
	const name = String(params.name || "").trim(), player = String(params.player || "").trim();
	if (!lookupSecretOk_(params) || !name) return jsonOutput_({ found: false });
	const t = readTable_(getCharactersSheet_());
	for (let i = 0; i < t.rows.length; i++) {
		const r = t.rows[i];
		if (norm_(r[t.idx["Character Name"]]) === norm_(name) && norm_(r[t.idx["Player Name"]]) === norm_(player)) {
			return jsonOutput_({
				found: true, id: String(r[t.idx["Character ID"]]), species: r[t.idx["Species"]] || "", background: r[t.idx["Background"]] || "",
				class: r[t.idx["Class"]] || "", subclass: r[t.idx["Subclass"]] || "", level: r[t.idx["Level"]] || "",
				alignment: r[t.idx["Alignment"]] || "", party: publishedFor_(r[t.idx["Character ID"]]).party, lastUpdated: iso_(r[t.idx["Last Updated"]]),
			});
		}
	}
	return jsonOutput_({ found: false });
}

/** Read-only, for the Discord bot: party totals (gold EARNED, from published awards) and the published awards. */
function leaderboardData_() {
	const ct = readTable_(getCharactersSheet_());
	const partyOf = {}; // "name|player" -> published party
	ct.rows.forEach(function (r) {
		partyOf[norm_(r[ct.idx["Character Name"]]) + "|" + norm_(r[ct.idx["Player Name"]])] = publishedFor_(r[ct.idx["Character ID"]]).party;
	});
	const awards = publishedAwards_().map(function (a) {
		a.party = partyOf[norm_(a.character) + "|" + norm_(a.player)] || "";
		return a;
	});
	const parties = {};
	awards.forEach(function (a) {
		if (!a.party) return;
		const p = parties[a.party] = parties[a.party] || { party: a.party, total: 0, characters: {} };
		p.total += a.amount;
		const k = a.character + "|" + a.player;
		p.characters[k] = (p.characters[k] || 0) + a.amount;
	});
	const list = Object.keys(parties).map(function (k) {
		const p = parties[k];
		return {
			party: p.party, total: p.total,
			characters: Object.keys(p.characters).map(function (c) { return { character: c.split("|")[0], player: c.split("|")[1], total: p.characters[c] }; })
				.sort(function (a, b) { return b.total - a.total; }),
		};
	}).sort(function (a, b) { return b.total - a.total; });
	return { ok: true, parties: list, awards: awards, generatedAt: new Date().toISOString() };
}

function pullCharacter_(params) {
	const t = readTable_(getCharactersSheet_());
	const hit = authCharacter_(t, params.id, params.token);
	if (!hit) return jsonOutput_({ ok: false, error: "not found or bad token" });
	const o = rowObj_(t, hit.row);
	const pub = publishedFor_(o["Character ID"]);
	const mine = publishedAwards_().filter(function (a) { return norm_(a.character) === norm_(o["Character Name"]) && norm_(a.player) === norm_(o["Player Name"]); }).slice(-20);
	return jsonOutput_({
		ok: true,
		character: { id: o["Character ID"], name: o["Character Name"], player: o["Player Name"], species: o["Species"], background: o["Background"],
			class: o["Class"], subclass: o["Subclass"], level: o["Level"], alignment: o["Alignment"] },
		playerOwned: { hp: o["HP"], hpMax: o["HP Max"], ac: o["AC"], gold: o["Gold"], inventory: o["Inventory"], spellSlots: o["Spell Slots"] },
		dm: pub,
		awards: mine,
		lastPushed: iso_(o["Last Pushed"]),
	});
}

/** Player-side write. ONLY the PLAYER_FIELDS keys below are ever written; anything else is reported back as rejected. */
const PUSH_FIELDS = { hp: "HP", hpMax: "HP Max", ac: "AC", gold: "Gold", inventory: "Inventory", spellSlots: "Spell Slots" };

function validatePushValue_(key, v) {
	if (key === "hp" || key === "hpMax") return typeof v === "number" && isFinite(v) && v >= 0 && v <= 9999 ? Math.round(v) : undefined;
	if (key === "ac") return typeof v === "number" && isFinite(v) && v >= 0 && v <= 99 ? Math.round(v) : undefined;
	if (key === "gold") return typeof v === "number" && isFinite(v) && v >= -1e9 && v <= 1e9 ? Math.round(v * 100) / 100 : undefined;
	if (key === "inventory") return typeof v === "string" && v.length <= 8000 ? v : undefined;
	if (key === "spellSlots") return validSlotsJson_(v) ? v : undefined;
	return undefined;
}

function pushCharacter_(body) {
	const lock = LockService.getScriptLock();
	lock.waitLock(30000);
	try {
		const sheet = getCharactersSheet_();
		const t = readTable_(sheet);
		const hit = authCharacter_(t, body.id, body.token);
		if (!hit) return jsonOutput_({ ok: false, error: "not found or bad token" });
		const fields = body.fields && typeof body.fields === "object" ? body.fields : {};
		const updated = [], rejected = [];
		const row = hit.row.slice();
		Object.keys(fields).forEach(function (k) {
			if (!PUSH_FIELDS[k]) { rejected.push(k + ": not a player-owned field"); return; }
			const v = validatePushValue_(k, fields[k]);
			if (v === undefined) { rejected.push(k + ": invalid value"); return; }
			row[t.idx[PUSH_FIELDS[k]]] = v;
			updated.push(k);
		});
		const now = new Date();
		if (updated.length) {
			row[t.idx["Last Pushed"]] = now;
			writeRow_(sheet, hit.rowNumber, row);
		}
		return jsonOutput_({ ok: true, updated: updated, rejected: rejected, pushedAt: updated.length ? now.toISOString() : null });
	} finally {
		lock.releaseLock();
	}
}

function doPost(e) {
	let body;
	try { body = JSON.parse((e && e.postData && e.postData.contents) || "{}"); } catch (err) { return jsonOutput_({ ok: false, error: "bad json" }); }
	if (body && body.action === "push") return pushCharacter_(body);
	if (body && body.action === "testhook") return testHook_(body); // disabled unless TEST_HOOK_SECRET is set; ZZSTRESS_ data only
	return jsonOutput_({ ok: false, error: "unknown action" });
}

// ---------------------------------------------------------------- the wipe (editor-run only, no web endpoint)

function isCharacterFile_(file) {
	const n = file.getName();
	return n !== INSTALL_INSTRUCTIONS_FILENAME && /\.(md|pdf)$/i.test(n);
}

/** Run from the Apps Script editor. Logs exactly what wipeAndRebuildCharacterData() would remove. Changes nothing. */
function wipeCharacterEntriesDryRun() { return wipeCharacterEntries_(true); }

/** Run from the Apps Script editor. Removes EVERY character entry and rebuilds empty scaffolding:
 *   - Drive: character .md/.pdf files in "Kadria Character Sheets" go to Drive trash (restorable ~30 days);
 *     the folder and the install-instructions PDF stay.
 *   - Sheet: the legacy "Character Database" tab is deleted; Characters / Published / Gold Awards are
 *     (re)created empty with their headers; Submissions keeps its header row only.
 *  A verified copy of all of it was archived on 2026-10-05 (Kadria Archive Sandbox). */
function wipeAndRebuildCharacterData() { return wipeCharacterEntries_(false); }

function wipeCharacterEntries_(dryRun) {
	const ss = SpreadsheetApp.getActiveSpreadsheet();
	const report = { dryRun: !!dryRun, driveFilesTrashed: 0, tabs: {} };

	const folder = getOrCreateDriveFolder_();
	const files = folder.getFiles();
	while (files.hasNext()) {
		const f = files.next();
		if (!isCharacterFile_(f)) continue;
		report.driveFilesTrashed++;
		if (!dryRun) f.setTrashed(true);
	}

	// build the new scaffolding first so the spreadsheet never ends up with zero tabs
	[[CHARACTERS_SHEET_NAME, CHARACTERS_HEADERS], [PUBLISHED_SHEET_NAME, PUBLISHED_HEADERS], [AWARDS_SHEET_NAME, AWARDS_HEADERS]].forEach(function (p) {
		const existing = ss.getSheetByName(p[0]);
		report.tabs[p[0]] = { rowsRemoved: existing ? Math.max(0, existing.getLastRow() - 1) : 0 };
		if (dryRun) return;
		if (existing) ss.deleteSheet(existing);
		ensureTab_(p[0], p[1]);
	});
	const legacy = ss.getSheetByName(LEGACY_DATABASE_SHEET_NAME);
	if (legacy) {
		report.tabs[LEGACY_DATABASE_SHEET_NAME] = { rowsRemoved: Math.max(0, legacy.getLastRow() - 1), tabDeleted: true };
		if (!dryRun) ss.deleteSheet(legacy);
	}
	const subs = ss.getSheetByName(SHEET_NAME);
	if (subs) {
		report.tabs[SHEET_NAME] = { rowsRemoved: Math.max(0, subs.getLastRow() - 1) };
		if (!dryRun && subs.getLastRow() > 1) subs.deleteRows(2, subs.getLastRow() - 1);
	}
	if (!dryRun) formatCharacterTabs_();
	Logger.log(JSON.stringify(report, null, 2));
	return report;
}

/** Colour-codes who owns what, notes the draft rule on the DM columns, and protects the id and token columns. */
function formatCharacterTabs_() {
	const sheet = getCharactersSheet_();
	const col = function (h) { return CHARACTERS_HEADERS.indexOf(h) + 1; };
	const paint = function (headers, color, note) {
		headers.forEach(function (h) {
			const c = sheet.getRange(1, col(h));
			c.setBackground(color);
			if (note) c.setNote(note);
		});
	};
	paint(["Character ID", "Character Name", "Player Name", "Species", "Background", "Class", "Subclass", "Level", "Alignment"], "#e8eaed",
		"Written by the intake form. Level, class and species change only by resubmitting the form.");
	paint(PLAYER_FIELDS, "#d2e3fc", "Owned by the player: written by My Little Guy's Send to sheet. Do not edit; the player's next send overwrites it.");
	paint(DM_FIELDS, "#feefc3", "DM-owned DRAFT. Players do not see changes here until you publish them (Kadria menu > Publish DM changes).");
	paint(["Sheet File", "Token", "Older Versions", "Last Updated", "Last Pushed", "Published Version"], "#e8eaed", "");
	[col("Character ID"), col("Token")].forEach(function (c) {
		const p = sheet.getRange(2, c, Math.max(sheet.getMaxRows() - 1, 1), 1).protect();
		p.setDescription("Identity and sync token: do not edit").setWarningOnly(true);
	});
}
