// node tests/visible-newlines.mjs [dir…] — finds text that would show a
// literal "\n" on screen instead of a line break:
//   - JSX text with \n in it: <div>1. Lue\n2. Tee</div> (JSX text has no
//     escapes, so the backslash and the n are drawn as they are)
//   - a doubled escape in a string or JSON: "1. Lue\\n2. Tee"
// A real line break inside one text does not break the line either (white
// space collapses as in HTML), so write each line as its own element.
// A line that really means a backslash and an n can end with the comment
// `rg-allow-backslash-n`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const JSX_TEXT = />([^<>{}"'`\n]*\\n[^<>{}"'`\n]*)[<{]/;
const DOUBLED = /(^|[^\\])(\\\\)+n/;

export function findVisibleNewlines(path, text) {
  const out = [];
  const jsx = /\.(tsx|jsx)$/.test(path);
  text.split("\n").forEach((line, i) => {
    if (line.includes("rg-allow-backslash-n")) return;
    if (jsx && JSX_TEXT.test(line)) out.push({ line: i + 1, why: "JSX text with \\n", text: line.trim() });
    else if (DOUBLED.test(line)) out.push({ line: i + 1, why: "doubled \\\\n in a string", text: line.trim() });
  });
  return out;
}

function walk(dir, files) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (/\.(tsx|ts|jsx|js|json)$/.test(name) && !name.endsWith(".local.js")) files.push(p);
  }
  return files;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // the checker's own cases
  const cases = [
    ["a.tsx", "<div>1. Lue\\n2. Tee</div>", 1],
    ["a.tsx", 'const s = "1. Lue\\\\n2. Tee";', 1],
    ["a.json", '{"t": "a\\\\nb"}', 1],
    ["a.tsx", 'const s = "1. Lue\\n2. Tee";', 0],
    ["a.tsx", "<div>{\"a\\nb\"}</div>", 0],
    ["a.ts", 'const re = /\\\\n/; // rg-allow-backslash-n', 0],
  ];
  let bad = 0;
  for (const [p, t, n] of cases) {
    const got = findVisibleNewlines(p, t).length;
    if (got !== n) { console.log("checker case failed:", p, t, "found", got, "wanted", n); bad++; }
  }
  const dirs = process.argv.slice(2);
  for (const d of dirs.length ? dirs : ["games"]) {
    for (const f of walk(d, [])) {
      for (const hit of findVisibleNewlines(f, readFileSync(f, "utf8"))) {
        console.log(`${f}:${hit.line}: ${hit.why}: ${hit.text.slice(0, 120)}`);
        bad++;
      }
    }
  }
  if (bad) { console.log(bad + " visible \\n problem(s)"); process.exit(1); }
  console.log("no visible \\n in game texts");
}
