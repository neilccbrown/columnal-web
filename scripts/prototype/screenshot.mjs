import { chromium } from "playwright";
const [url, out, ...actions] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on("console", m => { if (m.type() === "error" || m.type() === "warning") console.log("console:", m.type(), m.text().slice(0, 300)); });
page.on("pageerror", e => console.log("pageerror:", e.message));
await page.goto(url);
await page.waitForTimeout(3000);
for (const a of actions) { console.log(await page.evaluate(a)); await page.waitForTimeout(500); }
await page.screenshot({ path: out });
console.log(await page.evaluate(() => JSON.stringify(window.__proto?.timings)));
await browser.close();
