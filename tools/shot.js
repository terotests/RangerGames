// Takes screenshots of the web build in Chromium: node tools/shot.js <url> <out.png> [taps "x,y;x,y"] [wait ms] [w] [h]
const { chromium } = require("playwright");
(async () => {
  const [url, out, taps = "", wait = "800", w = "360", h = "640"] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, hasTouch: false });
  const logs = [];
  page.on("console", (m) => logs.push(m.type() + ": " + m.text()));
  page.on("pageerror", (e) => logs.push("pageerror: " + e.message));
  await page.goto(url);
  await page.waitForTimeout(+wait);
  for (const t of taps.split(";").filter(Boolean)) {
    if (t.startsWith("key:")) { await page.keyboard.press(t.slice(4)); }
    else if (t.startsWith("hold:")) { const [k, ms] = t.slice(5).split("@"); await page.keyboard.down(k); await page.waitForTimeout(+ms); await page.keyboard.up(k); }
    else if (t.startsWith("wait:")) { await page.waitForTimeout(+t.slice(5)); }
    else { const [x, y] = t.split(",").map(Number); await page.mouse.click(x, y); }
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: out });
  console.log(logs.slice(-15).join("\n"));
  await browser.close();
})();
