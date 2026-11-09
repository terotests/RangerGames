// Renders the pictures of tools/kielisaari/art.js into games/kielisaari/img/*.png
// (and their SVG sources into tools/kielisaari/svg/ for editing).
//   node tools/kielisaari/render.js [sheet.png]     (sheet: all pictures on one page, for a look)
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { ART } = require("./art");

(async () => {
  const root = path.join(__dirname, "..", "..");
  const out = path.join(root, "games", "kielisaari", "img");
  const src = path.join(__dirname, "svg");
  fs.mkdirSync(out, { recursive: true });
  fs.mkdirSync(src, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [name, svg] of Object.entries(ART)) {
    fs.writeFileSync(path.join(src, name + ".svg"), svg);
    const w = +svg.match(/width="(\d+)"/)[1], h = +svg.match(/height="(\d+)"/)[1];
    // the land pictures fill the screen's width: twice its size for a sharp phone screen
    const scale = name.startsWith("bg_") ? 2 : 1;
    await page.setViewportSize({ width: w * scale, height: h * scale });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg style="display:block;width:${w * scale}px;height:${h * scale}px" `)}</body></html>`);
    await page.screenshot({ path: path.join(out, name + ".png"), omitBackground: true });
  }
  const sheet = process.argv[2];
  if (sheet) {
    const cells = Object.entries(ART).map(([n, s]) => `<div style="display:inline-block;margin:6px;text-align:center;font:12px sans-serif;background:${n.startsWith("bg_") ? "#fff" : "#cfe3cf"}"><img src="data:image/svg+xml;base64,${Buffer.from(s).toString("base64")}" style="max-width:${n.startsWith("bg_") ? 360 : 180}px"><br>${n}</div>`);
    await page.setViewportSize({ width: 1500, height: 900 });
    await page.setContent(`<html><body style="margin:0;background:#888">${cells.join("")}</body></html>`);
    await page.screenshot({ path: sheet, fullPage: true });
  }
  await browser.close();
})();
