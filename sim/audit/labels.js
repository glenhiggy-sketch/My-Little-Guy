const fs=require("fs"),path=require("path");const dir=path.join(__dirname,"chars");const parse=require("./parse-dump");
const seen={};
for(const f of fs.readdirSync(dir)){const t=fs.readFileSync(path.join(dir,f),"utf8");
 for(const m of t.matchAll(/^\*\*([^*:]{2,60}?):?\*\*/gm)) (seen[m[1].replace(/:$/,"")]=seen[m[1].replace(/:$/,"")]||[]).push(f.replace(".md",""));
 for(const m of t.matchAll(/^#{2,4} (.+)$/gm)) (seen["## "+m[1]]=seen["## "+m[1]]||[]).push(f.replace(".md",""));}
const keys={};for(const f of fs.readdirSync(dir)){const o=parse(fs.readFileSync(path.join(dir,f),"utf8"));for(const k of Object.keys(o))(keys[k]=keys[k]||[]).push(f.replace(".md",""));}
console.log("== labels/headings in sheets (count of classes)");for(const[k,v]of Object.entries(seen).sort())console.log(String(v.length).padStart(2),k);
console.log("\n== keys the plugin parses (count)");for(const[k,v]of Object.entries(keys).sort())console.log(String(v.length).padStart(2),k);
