// Builds the real character PDF locally (pdf-lib + the Intake PdfFiller, Apps Script's Utilities stubbed) for a class/subclass/level,
// and writes it to a file so the feature pages can be looked at.   node local-pdf.js Fighter "Battle Master" 20 out.pdf
"use strict";
const vm = require("vm"), fs = require("fs"), path = require("path");
const { build, load } = require("./local-build");
const DIR = process.env.APPSCRIPT_DIR || "B:/New folder/Second Brain.vault/_Agent-Only/code/kadria-appscript";

(async () => {
  const [cls, sub, level, out] = process.argv.slice(2);
  const r = build({ cls: cls || "Fighter", sub: sub || "Battle Master", level: +(level || 20) });
  const ctx = r.ctx;
  ctx.Utilities = {
    base64Decode: (b64) => Array.from(Buffer.from(b64, "base64")),
    newBlob: (bytes, type, name) => ({ bytes, type, name, getBytes: () => bytes }),
  };
  ctx.Uint8Array = Uint8Array; ctx.Buffer = Buffer; ctx.TextEncoder = TextEncoder; ctx.TextDecoder = TextDecoder;
  for (const f of ["PdfLib.js", "PdfTemplates.js", "PdfFiller.js"]) vm.runInContext(fs.readFileSync(path.join(DIR, f), "utf8"), ctx, { filename: f });
  const blob = await ctx.kadriaBuildFilledPdfBlob(r.character, "test.pdf");
  const bytes = Buffer.from(blob.getBytes ? blob.getBytes() : blob.bytes);
  const file = out || path.join(__dirname, "local-pdf-test.pdf");
  fs.writeFileSync(file, bytes);
  console.log("wrote", file, bytes.length, "bytes");
})().catch((e) => { console.error(e); process.exit(1); });
