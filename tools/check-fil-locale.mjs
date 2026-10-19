// Compares a Filipino locale file against Hubs English strings: same keys, placeholders and tags, valid ICU.
// Usage (from hubs/): npm run -s intl-extract-en-locale; node ../tools/check-fil-locale.mjs <english.json> src/assets/locales/fil.json
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/package.json");
const { parse, TYPE } = require("@formatjs/icu-messageformat-parser");
const todo = JSON.parse(readFileSync(process.argv[2], "utf8"));
const fil = JSON.parse(readFileSync(process.argv[3], "utf8"));
function sig(msg) {
  const args = new Set(), tags = new Set();
  const walk = els => els.forEach(e => {
    if (e.type === TYPE.tag) { tags.add(e.value); walk(e.children); }
    else if (e.type !== TYPE.literal && e.type !== TYPE.pound) args.add(e.value);
    if (e.options) Object.values(e.options).forEach(o => walk(o.value));
  });
  walk(parse(msg));
  return JSON.stringify([[...args].sort(), [...tags].sort()]);
}
let bad = 0;
for (const [k, en] of Object.entries(todo)) {
  if (!(k in fil)) { console.log("MISSING", k); bad++; continue; }
  try { if (sig(en) !== sig(fil[k])) { console.log("MISMATCH", k, sig(en), sig(fil[k])); bad++; } }
  catch (e) { console.log("PARSE", k, e.message); bad++; }
}
for (const k of Object.keys(fil)) if (!(k in todo)) console.log("EXTRA (ok if from teacher-hud)", k);
console.log(bad ? `${bad} problems` : `all ${Object.keys(todo).length} strings OK`);
process.exit(bad ? 1 : 0);
