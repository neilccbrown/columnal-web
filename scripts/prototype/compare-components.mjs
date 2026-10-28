// Runs the same checks on the Reka UI and Ark UI versions of the Phase 7 component prototypes
// (src/gui/prototype/components), and prints which behave as the Java original did.  Needs the dev
// server: npx vite --port 5190, then node scripts/prototype/compare-components.mjs
import { chromium } from "playwright";

const browser = await chromium.launch();
const results = {};

async function check(side, name, fn)
{
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errors.push(m.text().slice(0, 200)); });
    page.on("pageerror", e => errors.push(e.message));
    await page.goto("http://localhost:5190/src/gui/prototype/components/");
    const root = page.getByTestId(side);
    let outcome;
    try
    {
        outcome = (await fn(page, root)) ?? "ok";
    }
    catch (e)
    {
        outcome = "FAIL: " + e.message.split("\n")[0];
    }
    if (errors.length > 0)
        outcome += ` (console: ${errors.join(" | ")})`;
    (results[name] ??= {})[side] = outcome;
    await page.close();
}

// Waits until the open menu has focus (Ark focuses and positions it a frame or two after opening):
async function menuReady(page)
{
    await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "menu");
    await page.waitForTimeout(50);
}

const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const focused = page => page.evaluate(() => { const a = document.activeElement; return a ? (a.getAttribute("data-testid") ?? a.tagName + ":" + (a.textContent ?? "").trim().slice(0, 20)) : null; });

for (const side of ["reka", "ark"])
{
    await check(side, "dialog: opens with role and name, focus inside", async (page, root) =>
    {
        await root.getByTestId("open-dialog").click();
        const dialog = page.getByRole("dialog", { name: "New column" });
        await dialog.waitFor();
        expect(await dialog.evaluate(d => d.contains(document.activeElement)), "focus not in dialog: " + await focused(page));
        return "focus on " + await focused(page);
    });
    await check(side, "dialog: Tab stays inside (focus trap)", async (page, root) =>
    {
        await root.getByTestId("open-dialog").click();
        const dialog = page.getByRole("dialog");
        await dialog.waitFor();
        for (let i = 0; i < 5; i++)
        {
            await page.keyboard.press("Tab");
            expect(await dialog.evaluate(d => d.contains(document.activeElement)), "focus escaped after " + (i + 1) + " tabs");
        }
    });
    await check(side, "dialog: Escape closes and focus returns to opener", async (page, root) =>
    {
        await root.getByTestId("open-dialog").click();
        await page.getByRole("dialog").waitFor();
        await page.keyboard.press("Escape");
        await page.getByRole("dialog").waitFor({ state: "detached" });
        expect(await focused(page) === "open-dialog", "focus is on " + await focused(page));
    });
    await check(side, "dialog: click outside (Java: stays open, window-modal)", async (page, root) =>
    {
        await root.getByTestId("open-dialog").click();
        await page.getByRole("dialog").waitFor();
        await page.mouse.click(5, 5);
        await page.waitForTimeout(300);
        return (await page.getByRole("dialog").count()) > 0 ? "stays open" : "closes (needs a prop to match Java)";
    });
    await check(side, "dialog: drag to move", async (page, root) =>
    {
        await root.getByTestId("open-dialog").click();
        const dialog = page.getByRole("dialog");
        await dialog.waitFor();
        const before = await dialog.boundingBox();
        await page.mouse.move(before.x + 10, before.y + 5);
        await page.mouse.down();
        await page.mouse.move(before.x + 110, before.y + 55, { steps: 5 });
        await page.mouse.up();
        const after = await dialog.boundingBox();
        expect(Math.round(after.x - before.x) === 100 && Math.round(after.y - before.y) === 50, `moved by ${after.x - before.x}, ${after.y - before.y}`);
    });
    await check(side, "menu: right-click opens role=menu at the pointer, first item not highlighted", async (page, root) =>
    {
        const header = root.getByTestId("column-header");
        const box = await header.boundingBox();
        await header.click({ button: "right", position: { x: 20, y: 10 } });
        await menuReady(page);
        const menu = page.getByRole("menu");
        const m = await menu.boundingBox();
        const items = await page.getByRole("menuitem").allTextContents();
        return `at (${Math.round(m.x - box.x - 20)}, ${Math.round(m.y - box.y - 10)}) from the pointer; items: ${items.map(s => s.trim()).join(", ")}`;
    });
    await check(side, "menu: arrows skip the disabled item, Right opens submenu, Enter selects", async (page, root) =>
    {
        await root.getByTestId("column-header").click({ button: "right" });
        await menuReady(page);
        const highlighted = () => page.evaluate(() => [...document.querySelectorAll("[data-highlighted]")].map(e => e.textContent.trim()).join(" / "));
        await page.keyboard.press("ArrowDown");
        const first = await highlighted();
        await page.keyboard.press("ArrowDown");
        const second = await highlighted();
        expect(second.startsWith("Sort by"), `after two downs: "${first}" then "${second}"`);
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(200);
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
        await page.waitForTimeout(200);
        const log = await root.getByTestId("log").textContent();
        expect(log.includes("menu sort-descending"), "log: " + log);
        expect(await page.getByRole("menu").count() === 0, "menu still open");
        return `first Down: "${first}"`;
    });
    await check(side, "menu: typing a letter jumps to an item (typeahead)", async (page, root) =>
    {
        await root.getByTestId("column-header").click({ button: "right" });
        await menuReady(page);
        await page.keyboard.press("h");
        await page.waitForTimeout(100);
        const h = await page.evaluate(() => [...document.querySelectorAll("[data-highlighted]")].map(e => e.textContent.trim()).join(" / "));
        expect(h === "Hide column", `highlighted "${h}"`);
    });
    await check(side, "tooltip: shows full text of an abbreviated label on hover", async (page, root) =>
    {
        await root.getByTestId("column-header").hover();
        const tip = page.getByRole("tooltip");
        await tip.waitFor({ timeout: 3000 });
        return "text: " + (await tip.textContent()).trim().slice(0, 30) + "...";
    });
    await check(side, "combobox: typing filters, Down + Enter picks", async (page, root) =>
    {
        const input = root.getByRole("combobox");
        await input.click();
        await input.pressSequentially("big");
        await page.waitForTimeout(200);
        const options = (await page.getByRole("option").allTextContents()).map(s => s.trim());
        expect(options.join(",") === "Big,Big calc", "options: " + options.join(","));
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
        await page.waitForTimeout(200);
        const log = await root.getByTestId("log").textContent();
        return `picked: ${log.trim()}; input shows "${await input.inputValue()}"`;
    });
    await check(side, "combobox: accent-insensitive filter (\"oster\")", async (page, root) =>
    {
        const input = root.getByRole("combobox");
        await input.click();
        await input.pressSequentially("oster");
        await page.waitForTimeout(200);
        return "options: " + ((await page.getByRole("option").allTextContents()).map(s => s.trim()).join(",") || "(none)");
    });
}

for (const [name, r] of Object.entries(results))
{
    console.log(name);
    console.log("  Reka: " + r.reka);
    console.log("  Ark:  " + r.ark);
}
await browser.close();
