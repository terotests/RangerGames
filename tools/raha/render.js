// Renders the money of tools/raha/art.js into games/raha/img/*.png.
//   node tools/raha/render.js [sheet.png]     (sheet: everything on one page, for a look)
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { ART } = require("./art");

(async () => {
  const out = path.join(__dirname, "..", "..", "games", "raha", "img");
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [name, svg] of Object.entries(ART)) {
    const w = +svg.match(/width="(\d+)"/)[1], h = +svg.match(/height="(\d+)"/)[1];
    // coins are 200 px pictures shown at ~50 px: half size is still sharp on a phone
    const scale = name.startsWith("c") || name === "e1" || name === "e2" ? 0.6 : 1;
    const W = Math.round(w * scale), H = Math.round(h * scale);
    await page.setViewportSize({ width: W, height: H });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg style="display:block;width:${W}px;height:${H}px" `)}</body></html>`);
    await page.screenshot({ path: path.join(out, name + ".png"), omitBackground: true });
  }
  const sheet = process.argv[2];
  if (sheet) {
    const cells = Object.entries(ART).map(([n, s]) => `<div style="display:inline-block;margin:8px;text-align:center;font:12px sans-serif"><img src="data:image/svg+xml;base64,${Buffer.from(s).toString("base64")}" style="height:${n.length <= 3 && n !== "e10" && n !== "e20" && n !== "e50" ? 90 : 120}px"><br>${n}</div>`);
    await page.setViewportSize({ width: 1100, height: 500 });
    await page.setContent(`<html><body style="margin:0;background:#cfe3cf">${cells.join("")}</body></html>`);
    await page.screenshot({ path: sheet, fullPage: true });
  }
  await browser.close();
})();
