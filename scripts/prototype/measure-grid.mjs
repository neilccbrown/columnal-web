// Measures the Phase 7 grid prototype (src/gui/prototype/grid) in Chromium: loading, scrolling,
// keyboard movement and editing, on the golden file with the 190,512-row join, plus a generated
// data table.  Needs the dev server: npx vite --port 5190, then
//   node scripts/prototype/measure-grid.mjs [bigRows] [cpuSlowdown] [worker]
import { chromium } from "playwright";

const bigRows = Number(process.argv[2] ?? 200000);
const slowdown = Number(process.argv[3] ?? 1);
// "worker" runs the engine in a Web Worker (the worker spike):
const worker = process.argv[4] === "worker";
const url = `http://localhost:5190/src/gui/prototype/grid/?big=${bigRows}` + (worker ? "&worker" : "");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on("pageerror", e => console.log("pageerror:", e.message));
const cdp = await page.context().newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: slowdown });

const t0 = Date.now();
await page.goto(url, { timeout: 600_000 });
await page.waitForFunction(() => window.__proto?.tableLength("Big") > 0 || window.__proto?.tableLength("Trans 4") > 0, null, { timeout: 600_000 });
await page.evaluate(() => window.__proto.framesUntilIdle(600));
console.log(`${worker ? "Engine in a worker" : "Engine on the main thread"}, CPU slowdown ${slowdown}x, big table ${bigRows} rows; page ready in ${Date.now() - t0} ms`);
for (const t of await page.evaluate(() => window.__proto.timings))
    console.log(`  ${t.what}: ${t.ms.toFixed(0)} ms`);
console.log(`  DOM nodes: ${await page.evaluate(() => window.__proto.domNodes())}`);

await cdp.send("Performance.enable");
// Runs a benchmark, and adds where the main thread's time went (from Chromium's metrics, and the
// prototype's own count of the time spent getting values from the engine):
async function measured(run)
{
    const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(m => [m.name, m.value]));
    const before = await metrics();
    const fetchBefore = await page.evaluate(() => ({ ...window.__proto.fetchTime }));
    const result = await page.evaluate(run);
    const after = await metrics();
    const fetchAfter = await page.evaluate(() => ({ ...window.__proto.fetchTime }));
    const ms = name => ((after[name] - before[name]) * 1000);
    const fetchMs = fetchAfter.ms - fetchBefore.ms;
    return fmt(result) + `\n      ${worker ? "worker" : "main thread"}: engine values ${fetchMs.toFixed(0)} ms (${fetchAfter.cells - fetchBefore.cells} cells), other script ${(ms("ScriptDuration") - fetchMs).toFixed(0)} ms, style ${ms("RecalcStyleDuration").toFixed(0)} ms, layout ${ms("LayoutDuration").toFixed(0)} ms, total task ${ms("TaskDuration").toFixed(0)} ms`;
}

const fmt = s => `${s.frames} frames, mean ${s.meanMs.toFixed(1)} ms, p95 ${s.p95Ms.toFixed(1)} ms, max ${s.maxMs.toFixed(1)} ms, >20ms: ${s.over20Ms}, >50ms: ${s.over50Ms}`;

for (const table of ["Trans 4", "Big"])
{
    if (await page.evaluate(n => window.__proto.tablePosition(n), table) === null)
        continue;
    await page.evaluate(n => window.__proto.scrollToTable(n, 0), table);
    await page.waitForTimeout(300);
    console.log(`Scrolling ${table}:`);
    console.log("  down 100 px/frame:  " + await measured(() => window.__proto.scrollBenchmark(0, 100, 300)));
    console.log("  down 2000 px/frame: " + await measured(() => window.__proto.scrollBenchmark(0, 2000, 300)));
    console.log("  right 40 px/frame:  " + await measured(() => window.__proto.scrollBenchmark(40, 0, 100)));
    console.log("  left 40 px/frame:   " + await measured(() => window.__proto.scrollBenchmark(-40, 0, 100)));
    console.log(`  DOM nodes after: ${await page.evaluate(() => window.__proto.domNodes())}`);
    const f = await page.evaluate(() => window.__proto.fetchTime);
    if (f.requests > 0)
        console.log(`  rows from the worker so far: ${f.requests} requests, mean ${(f.roundTripMs / f.requests).toFixed(0)} ms from asking to arriving`);
}

// Keyboard: input-to-paint latency of keydowns (the Event Timing API reports events over 16 ms).
await page.evaluate(() =>
{
    window.__slowEvents = [];
    new PerformanceObserver(list =>
    {
        for (const e of list.getEntries())
            if (e.name === "keydown")
                window.__slowEvents.push({ duration: e.duration, handler: e.processingEnd - e.processingStart });
    }).observe({ type: "event", durationThreshold: 16 });
});
await page.evaluate(() => window.__proto.scrollToTable("Trans 4", 0));
await page.waitForTimeout(300);
const firstCell = page.locator('[data-table="Trans 4"] .cell').first();
await firstCell.click();
let start = Date.now();
for (let i = 0; i < 200; i++)
    await page.keyboard.press("ArrowDown");
for (let i = 0; i < 20; i++)
    await page.keyboard.press("PageDown");
for (let i = 0; i < 10; i++)
    await page.keyboard.press("ArrowRight");
await page.evaluate(() => window.__proto.framesUntilIdle(100));
const slow = await page.evaluate(() => window.__slowEvents);
const pct = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))]?.toFixed(1);
const durations = slow.map(e => e.duration), handlers = slow.map(e => e.handler);
console.log(`Keyboard: 230 key presses in ${Date.now() - start} ms (including Playwright's round trips).  Key down to paint (Event Timing, 8 ms resolution; ${slow.length} of 230 reported): median ${pct(durations, 0.5)}, p95 ${pct(durations, 0.95)}, max ${pct(durations, 1)} ms; handler: median ${pct(handlers, 0.5)}, p95 ${pct(handlers, 0.95)}, max ${pct(handlers, 1)} ms`);
console.log(`  selection: ${await page.evaluate(() => window.__proto.selection())}`);

// Editing a value in the data table that the join depends on, then waiting for the dependents:
await page.evaluate(() => window.__proto.scrollToTable("Test 0", 0));
await page.waitForTimeout(300);
await page.locator('[data-table="Test 0"] .cell.number').first().click();
const timingsBefore = await page.evaluate(() => window.__proto.timings.length);
start = Date.now();
await page.keyboard.type("123");
await page.keyboard.press("Enter");
const editFrames = await page.evaluate(() => window.__proto.framesUntilIdle(600));
console.log(`Edit in Test 0, then re-running its dependents (including the join): settled in ${Date.now() - start} ms; ` + fmt(editFrames));
for (const t of (await page.evaluate(() => window.__proto.timings)).slice(timingsBefore))
    console.log(`  ${t.what}: ${t.ms.toFixed(0)} ms`);

if (bigRows > 0)
{
    await page.evaluate(() => window.__proto.scrollToTable("Big", 5000));
    await page.waitForTimeout(300);
    await page.locator('[data-table="Big"] .cell.number').nth(10).click();
    const before = await page.evaluate(() => window.__proto.timings.length);
    start = Date.now();
    await page.keyboard.type("42");
    await page.keyboard.press("Enter");
    const frames = await page.evaluate(() => window.__proto.framesUntilIdle(600));
    console.log(`Edit in Big: settled in ${Date.now() - start} ms; ` + fmt(frames));
    for (const t of (await page.evaluate(() => window.__proto.timings)).slice(before))
        console.log(`  ${t.what}: ${t.ms.toFixed(0)} ms`);
}

const heap = await cdp.send("Runtime.getHeapUsage");
console.log(`JS heap used: ${(heap.usedSize / 1e6).toFixed(0)} MB`);
await browser.close();
