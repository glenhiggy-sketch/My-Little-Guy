// Shared in-memory fakes of Sheets / Drive / locks / UI for the local Apps Script tests (not pushed, see .claspignore).
"use strict";
const vm = require("vm");
const crypto = require("crypto");

class Range {
	constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
	getValues() { const o = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.sheet.cell(this.r + i, this.c + j)); o.push(row); } return o; }
	setValues(v) { for (let i = 0; i < v.length; i++) for (let j = 0; j < v[i].length; j++) this.sheet.set(this.r + i, this.c + j, v[i][j]); return this; }
	setValue(v) { this.sheet.set(this.r, this.c, v); return this; }
	getRow() { return this.r; }
	setFontWeight() { return this; } setBackground() { return this; } setNote() { return this; }
	protect() { const p = { setDescription() { return p; }, setWarningOnly() { return p; } }; return p; }
}
class Sheet {
	constructor(name) { this.name = name; this.data = []; this.activeRange = null; }
	cell(r, c) { const v = (this.data[r - 1] || [])[c - 1]; return v === undefined ? "" : v; }
	set(r, c, v) { while (this.data.length < r) this.data.push([]); const row = this.data[r - 1]; while (row.length < c) row.push(""); row[c - 1] = v; }
	getRange(r, c, nr, nc) { return new Range(this, r, c, nr || 1, nc || 1); }
	getDataRange() { return new Range(this, 1, 1, this.getLastRow() || 1, this.getLastColumn() || 1); }
	getLastRow() { return this.data.length; }
	getLastColumn() { return this.data.reduce((m, r) => Math.max(m, r.length), 0); }
	getMaxRows() { return Math.max(1000, this.data.length); }
	appendRow(row) { this.data.push(row.slice()); }
	getActiveRange() { return this.activeRange; }
	setFrozenRows() {}
	deleteRows(start, n) { this.data.splice(start - 1, n); }
	deleteRow(r) { this.data.splice(r - 1, 1); }
	getName() { return this.name; }
}

function makeEnv() {
	const ss = { sheets: {}, active: null, getSheetByName(n) { return this.sheets[n] || null; }, insertSheet(n) { return (this.sheets[n] = new Sheet(n)); }, deleteSheet(s) { delete this.sheets[s.name]; } };
	const driveFiles = [];
	const folder = { getFiles() { let i = 0; return { hasNext: () => i < driveFiles.length, next: () => driveFiles[i++] }; } };
	// driveFiles entries: { getName(), setTrashed(b) }
	const props = { LOOKUP_SECRET: "s3cret" };
	const ui = {
		Button: { YES: "YES", NO: "NO", OK: "OK", CANCEL: "CANCEL" },
		ButtonSet: { YES_NO: "YES_NO", OK: "OK", OK_CANCEL: "OK_CANCEL" },
		alerts: [], prompts: [], answer: "YES", promptAnswers: [],
		alert(title, msg) { this.alerts.push({ title, msg }); return this.answer; },
		prompt(title) { this.prompts.push(title); const t = this.promptAnswers.shift(); return { getSelectedButton: () => (t === undefined ? "CANCEL" : "OK"), getResponseText: () => (t === undefined ? "" : t) }; },
		createMenu(name) { const m = { name, items: [], addItem(label, fn) { m.items.push([label, fn]); return m; }, addSeparator() { return m; }, addToUi() { ui.menu = m; } }; return m; },
	};
	const ctx = vm.createContext({
		SpreadsheetApp: { getActiveSpreadsheet: () => ss, getUi: () => ui, getActiveSheet: () => ss.active },
		Utilities: { getUuid: () => crypto.randomUUID() },
		LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
		PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null }) },
		ScriptApp: { getService: () => ({ getUrl: () => "https://script.google.com/macros/s/TEST/exec" }) },
		Logger: { log() {} },
		jsonOutput_: (o) => o,
		getOrCreateDriveFolder_: () => folder,
		SHEET_NAME: "Submissions",
		Date, JSON, Math, Number, String, Object, Array, isFinite, parseInt, RegExp,
	});
	return { ss, driveFiles, props, ui, ctx, Sheet, Range };
}

module.exports = { makeEnv };
