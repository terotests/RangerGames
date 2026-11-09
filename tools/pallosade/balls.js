// Draws the balls of games/pallosade (our own art): glossy white and yellow
// balls with a small face, as SVG, rendered to games/pallosade/img/<w|y>.png
// in Chromium.  node tools/pallosade/balls.js
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const SIZE = 96;
const BALLS = {
  w: { light: "#ffffff", mid: "#eef1f8", dark: "#b9c0d6", line: "#7d86a6", cheek: "#ffb3c1", eye: "#2b2d42" },
  y: { light: "#fff6b0", mid: "#ffd23f", dark: "#e09400", line: "#a86400", cheek: "#ff8a5c", eye: "#4a2a00" },
};

function svg(c, happy) {
  const mouth = happy
    ? `<path d="M 38 58 Q 48 70 58 58 Z" fill="${c.eye}"/>`
    : `<path d="M 40 58 Q 48 65 56 58" fill="none" stroke="${c.eye}" stroke-width="3" stroke-linecap="round"/>`;
  const eyes = happy
    ? `<path d="M 33 46 Q 37 40 41 46" fill="none" stroke="${c.eye}" stroke-width="3.2" stroke-linecap="round"/>
       <path d="M 55 46 Q 59 40 63 46" fill="none" stroke="${c.eye}" stroke-width="3.2" stroke-linecap="round"/>`
    : `<ellipse cx="37" cy="45" rx="3.6" ry="4.6" fill="${c.eye}"/><circle cx="38.4" cy="43.4" r="1.3" fill="#fff"/>
       <ellipse cx="59" cy="45" rx="3.6" ry="4.6" fill="${c.eye}"/><circle cx="60.4" cy="43.4" r="1.3" fill="#fff"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 96 96">
  <defs>
    <radialGradient id="g" cx="0.36" cy="0.32" r="0.75">
      <stop offset="0" stop-color="${c.light}"/><stop offset="0.45" stop-color="${c.mid}"/><stop offset="1" stop-color="${c.dark}"/>
    </radialGradient>
  </defs>
  <circle cx="48" cy="48" r="43" fill="url(#g)" stroke="${c.line}" stroke-width="3"/>
  <ellipse cx="33" cy="25" rx="13" ry="8" fill="#ffffff" opacity="0.75" transform="rotate(-30 33 25)"/>
  <circle cx="58" cy="20" r="3" fill="#ffffff" opacity="0.7"/>
  <ellipse cx="29" cy="56" rx="5.5" ry="3.3" fill="${c.cheek}" opacity="0.75"/>
  <ellipse cx="67" cy="56" rx="5.5" ry="3.3" fill="${c.cheek}" opacity="0.75"/>
  ${eyes}${mouth}
</svg>`;
}

(async () => {
  const out = path.join(__dirname, "../../games/pallosade/img");
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
  for (const [k, c] of Object.entries(BALLS)) {
    for (const happy of [false, true]) {
      await page.setContent(`<html><body style="margin:0;background:transparent">${svg(c, happy)}</body></html>`);
      await page.locator("svg").screenshot({ path: path.join(out, k + (happy ? "h" : "") + ".png"), omitBackground: true });
    }
  }
  await browser.close();
  console.log("wrote", fs.readdirSync(out).join(" "));
})();
