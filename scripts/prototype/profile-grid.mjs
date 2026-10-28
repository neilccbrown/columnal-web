// Profiles a fast scroll over a table in the Phase 7 grid prototype, and totals the CPU time by
// where it was spent: the engine, Vue, the prototype's own code, and the browser (style, layout,
// paint, garbage collection).  Needs the dev server (npx vite --port 5190):
//   node scripts/prototype/profile-grid.mjs [table] [px per frame] [bigRows]
import { chromium } from "playwright";

const table = process.argv[2] ?? "Trans 4";
const dy = Number(process.argv[3] ?? 2000);
const bigRows = Number(process.argv[4] ?? 200000);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(`http://localhost:5190/src/gui/prototype/grid/?big=${bigRows}`, { timeout: 600_000 });
await page.waitForFunction(n => window.__proto?.tableLength(n) > 0, table, { timeout: 600_000 });
await page.evaluate(() => window.__proto.framesUntilIdle(600));
await page.evaluate(n => window.__proto.scrollToTable(n, 0), table);
await page.waitForTimeout(300);

const cdp = await page.context().newCDPSession(page);
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
await cdp.send("Profiler.start");
const result = await page.evaluate(d => window.__proto.scrollBenchmark(0, d, 300), dy);
const { profile } = await cdp.send("Profiler.stop");

const bucket = (url, name) =>
{
    if (url === "")
        return name === "(idle)" ? "idle" : name === "(garbage collector)" ? "garbage collection" : name === "(program)" ? "browser (style, layout, paint...)" : "browser (native)";
    if (url.includes("/src/engine/") || url.includes("decimal") || url.includes("js-joda"))
        return "engine";
    if (url.includes("/node_modules/") && url.includes("vue"))
        return "Vue";
    if (url.includes("/src/gui"))
        return "prototype (src/gui, src/gui-logic)";
    return "other: " + url.replace(/^.*\/node_modules\//, "");
};
const byId = new Map(profile.nodes.map(n => [n.id, n]));
const totals = new Map();
const deltas = profile.timeDeltas;
profile.samples.forEach((id, i) =>
{
    const n = byId.get(id);
    const b = bucket(n.callFrame.url, n.callFrame.functionName);
    totals.set(b, (totals.get(b) ?? 0) + (deltas[i + 1] ?? 0) / 1000);
});
console.log(`${table}, ${dy} px per frame, ${result.frames} frames: mean ${result.meanMs.toFixed(1)} ms, p95 ${result.p95Ms.toFixed(1)} ms`);
for (const [b, ms] of [...totals].sort((a, b) => b[1] - a[1]))
    console.log(`  ${b}: ${ms.toFixed(0)} ms`);
// The native functions, attributed to whoever called them:
const parent = new Map();
for (const n of profile.nodes)
    for (const c of n.children ?? [])
        parent.set(c, n);
const natives = new Map();
profile.samples.forEach((id, i) =>
{
    let n = byId.get(id);
    if (n.callFrame.url !== "" || ["(idle)", "(program)", "(garbage collector)"].includes(n.callFrame.functionName))
        return;
    const name = n.callFrame.functionName;
    while (n !== undefined && n.callFrame.url === "")
        n = parent.get(n.id);
    const key = (n === undefined ? "?" : bucket(n.callFrame.url, "")) + " -> " + name;
    natives.set(key, (natives.get(key) ?? 0) + (deltas[i + 1] ?? 0) / 1000);
});
console.log("  native functions, by caller:");
for (const [k, ms] of [...natives].sort((a, b) => b[1] - a[1]).slice(0, 8))
    console.log(`    ${k}: ${ms.toFixed(0)} ms`);
await browser.close();
