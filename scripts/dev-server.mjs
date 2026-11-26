#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Dev reload server (scripts/dev.sh starts it): watches game folders and hands
// the files that changed to a running app, which puts them into its virtual
// directory and starts the game again (scripts) or only restyles it
// (style.css). No APK build for game code. See docs/dev-reload.md.
//
//   node scripts/dev-server.mjs [--port 8787] [--full] [ROOT ...]
//
// ROOT is either a games folder (games/: each folder in it is /games/<folder>)
// or one game's folder (has game.json: /games/<its folder name>), or
// id=path for a game folder under another id (solarpilot=~/games/solarpilot).
// Without ROOT: games/ of this repository.
// --full: the files of the game folders count as changed from the start (a
// game the APK does not have, or has an old version of). Without it only the
// files saved after the server started go to the app.
//
// Endpoints (the app: android DevLink.java, the web page: web/js/dev.js):
//   GET  /dev/changes?since=N[&wait=1]  {v, files:[{p, v, size}]}, the changes after N
//                                       (wait: holds up to 25 s for one)
//   GET  /f/<path>                      a file (path under /games, e.g. kello/game.tsx)
//   POST /dev/log                       the app's log lines, printed here
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
let port = 8787;
let full = false;
const rootArgs = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--port") port = Number(args[++i]);
  else if (a === "--full") full = true;
  else if (a === "-h" || a === "--help") {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\nimport ")[0].replace(/^#!.*\n/, ""));
    process.exit(0);
  } else rootArgs.push(a);
}
if (!rootArgs.length) rootArgs.push(path.join(here, "..", "games"));

const home = process.env.HOME || "";
// roots: { dir, prefix } — prefix "" for a games folder, "<id>/" for one game
const roots = rootArgs.map((a) => {
  let id = null;
  const eq = a.indexOf("=");
  if (eq > 0 && !a.slice(0, eq).includes("/")) {
    id = a.slice(0, eq);
    a = a.slice(eq + 1);
  }
  const dir = path.resolve(a.replace(/^~(?=\/|$)/, home));
  if (!fs.existsSync(dir)) {
    console.error(`dev: no folder ${dir}`);
    process.exit(1);
  }
  const game = id !== null || fs.existsSync(path.join(dir, "game.json"));
  return { dir, prefix: game ? `${id || path.basename(dir)}/` : "" };
});

// skipped: hidden files and folders, editors' temporary files, node_modules
const skip = (name) => name.startsWith(".") || name === "node_modules" || name.endsWith("~") || /\.(swp|tmp)$/.test(name);

// rel (path under /games) -> { file, mtime, size }
const files = new Map();
// rel -> { v, size }: the changes since the start
const changes = new Map();
let version = 0;

function relOf(root, file) {
  return root.prefix + path.relative(root.dir, file).split(path.sep).join("/");
}

function scan(root, dir, out) {
  let list;
  try {
    list = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const d of list) {
    if (skip(d.name)) continue;
    const f = path.join(dir, d.name);
    if (d.isDirectory()) scan(root, f, out);
    else if (d.isFile()) {
      try {
        const st = fs.statSync(f);
        out.set(relOf(root, f), { file: f, mtime: st.mtimeMs, size: st.size });
      } catch {}
    }
  }
}

function scanAll() {
  const out = new Map();
  for (const r of roots) scan(r, r.dir, out);
  return out;
}

// waiting /dev/changes requests, answered at the next change
let waiting = [];
let settle = null;

function changed(rel, meta) {
  version++;
  changes.set(rel, { v: version, size: meta.size });
  console.log(`dev: ${rel}`);
  // editors write a file in steps and several files at once: answer once they are done
  clearTimeout(settle);
  settle = setTimeout(() => {
    const w = waiting;
    waiting = [];
    for (const f of w) f();
  }, 120);
}

function check(rel, meta) {
  const old = files.get(rel);
  if (!meta) return;
  files.set(rel, meta);
  if (!old || old.mtime !== meta.mtime || old.size !== meta.size) changed(rel, meta);
}

for (const [rel, m] of scanAll()) {
  files.set(rel, m);
  if (full && roots.some((r) => r.prefix && rel.startsWith(r.prefix))) {
    version++;
    changes.set(rel, { v: version, size: m.size });
  }
}

// fs.watch where it watches whole trees (macOS, Windows, Linux with Node 20+),
// and a full look every few seconds for what it missed
function look(root, name) {
  if (!name) return;
  const f = path.join(root.dir, name.toString());
  if (path.relative(root.dir, f).split(path.sep).some(skip)) return;
  try {
    const st = fs.statSync(f);
    if (st.isFile()) check(relOf(root, f), { file: f, mtime: st.mtimeMs, size: st.size });
  } catch {}
}
let watching = 0;
for (const r of roots) {
  try {
    fs.watch(r.dir, { recursive: true }, (_ev, name) => look(r, name));
    watching++;
  } catch {}
}
setInterval(() => {
  for (const [rel, m] of scanAll()) check(rel, m);
}, watching === roots.length ? 3000 : 700);

function changesAfter(since) {
  const out = [];
  for (const [p, c] of changes) if (c.v > since) out.push({ p, v: c.v, size: c.size });
  return { v: version, files: out };
}

function fileOf(rel) {
  for (const r of roots) {
    if (r.prefix && !rel.startsWith(r.prefix)) continue;
    const f = path.resolve(r.dir, rel.slice(r.prefix.length));
    if (f !== r.dir && !f.startsWith(r.dir + path.sep)) continue;
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  return null;
}

let lastLog = "";
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  const url = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.end();
  } else if (url.pathname === "/dev/changes") {
    const since = Number(url.searchParams.get("since") || 0);
    const answer = () => {
      if (res.writableEnded) return;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(changesAfter(since)));
    };
    if (version > since || !url.searchParams.has("wait")) return answer();
    waiting.push(answer);
    const t = setTimeout(answer, 25000);
    res.on("close", () => clearTimeout(t));
  } else if (url.pathname.startsWith("/f/")) {
    const f = fileOf(decodeURIComponent(url.pathname.slice(3)));
    if (!f) {
      res.statusCode = 404;
      return res.end("no such file");
    }
    res.setHeader("Content-Type", "application/octet-stream");
    fs.createReadStream(f).pipe(res);
  } else if (url.pathname === "/dev/log" && req.method === "POST") {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const from = url.searchParams.get("from") || "app";
      for (const line of body.split("\n")) {
        if (!line || line === lastLog) continue;
        lastLog = line;
        console.log(`[${from}] ${line}`);
      }
      res.end();
    });
  } else {
    res.statusCode = 404;
    res.end("RangerGames dev reload server: /dev/changes, /f/<path>, /dev/log");
  }
});
server.listen(port, () => {
  for (const r of roots) console.log(`dev: ${r.dir} -> /games/${r.prefix}`);
  const n = changes.size;
  console.log(`dev: http://127.0.0.1:${port}  (${files.size} files${n ? `, ${n} sent at start (--full)` : ""}; save a file to send it)`);
});
