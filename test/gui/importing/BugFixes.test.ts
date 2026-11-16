// Tests of the Java bugs fixed in importing (each fails without its fix; see the "bug fix" PORT-NOTEs).
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { RectangleBounds } from "../../../src/gui-logic/stf/gui/grid/RectangleBounds.js";
import { clickOnItemInBounds } from "../base/clickTableLocation.js";
import { keyboardMoveTo } from "../base/scrollTo.js";
import { sleep } from "../base/util.js";
import { closeStarted, start } from "../transformations/fixtures.js";
import { cells, description, drag, importFile, newTables, ok, PEOPLE, ROW, tableValues, TARGET, texts, WIDTH } from "./fixtures.js";

afterEach(closeStarted);

// ImportChoicesDialog's undoClicked and resetClicked
test("Undo area and Reset area remake the preview, so OK imports the area shown", async () =>
{
    const a = await start();
    await importFile(a, "people.csv", PEOPLE);
    await vi.waitUntil(() => cells(".import-dest-grid").length === 3, { timeout: 5000 });
    // The top edge down a row, leaving out Alice:
    await drag({ x: 1.5 * WIDTH, y: 3 * ROW }, { x: 1.5 * WIDTH, y: 4 * ROW + 3 });
    await vi.waitUntil(() => cells(".import-dest-grid").length === 2, { timeout: 5000 });
    await userEvent.click(document.querySelector(".id-reset-import-selection")!);
    await vi.waitUntil(() => cells(".import-dest-grid").length === 3, { timeout: 5000 });
    await drag({ x: 1.5 * WIDTH, y: 3 * ROW }, { x: 1.5 * WIDTH, y: 4 * ROW + 3 });
    await vi.waitUntil(() => cells(".import-dest-grid").length === 2, { timeout: 5000 });
    await userEvent.click(document.querySelector(".id-undo-import-selection-change")!);
    await vi.waitUntil(() => cells(".import-dest-grid").length === 3, { timeout: 5000 });
    await ok();
    await vi.waitUntil(() => newTables(a).length === 1, { timeout: 5000 });
    expect(tableValues(a, "people").length).toBe(3);
});

// ImportChoicesDialog's loadSource (Java: numRowsChanged's second setTrim)
test("the first Undo area after the original loads goes back to the area before it", async () =>
{
    const a = await start();
    await importFile(a, "people.csv", PEOPLE);
    await vi.waitUntil(() => cells(".import-dest-grid").length === 3, { timeout: 5000 });
    expect(description()).toBe("Rows ↕ 2-4 of 4.  Columns ↔ 1-2 of 2.");
    await userEvent.click(document.querySelector(".id-undo-import-selection-change")!);
    // (The area before: none left out)
    expect(description()).toBe("Rows ↕ 1-4 of 4.  Columns ↔ 1-2 of 2.");
});

// ImporterGUI.makeGUI
test("a choice that isn't one of the options shows as Other..., with its text (no separator: empty)", async () =>
{
    const a = await start();
    // One column, so no separator is guessed:
    await importFile(a, "names.csv", "Name\nAlice\nBob\nCarol\n");
    await vi.waitUntil(() => cells(".import-dest-grid").length > 0, { timeout: 5000 });
    expect(texts(".import-choice-combo")).toEqual(["UTF-8", "Other...", "None"]);
    expect(document.querySelector<HTMLInputElement>(".import-choice-other")?.value).toBe("");
});

// importTrim.dragged
test("the area's left edge can't be dragged onto the row numbers", async () =>
{
    const a = await start();
    await importFile(a, "people.csv", PEOPLE);
    await vi.waitUntil(() => cells(".import-dest-grid").length === 3, { timeout: 5000 });
    await drag({ x: WIDTH, y: 3.5 * ROW }, { x: 3, y: 3.5 * ROW });
    expect(description()).toBe("Rows ↕ 2-4 of 4.  Columns ↔ 1-2 of 2.");
});

// ImporterManager.matches
test("a file's importer is found by its extension, whatever its case", async () =>
{
    const a = await start();
    await importFile(a, "PEOPLE.CSV", PEOPLE);
    await vi.waitUntil(() => cells(".import-dest-grid").length === 3 || document.querySelector(".importer-list") !== null, { timeout: 5000 });
    expect(document.querySelector(".importer-list")).toBeNull();
    expect(cells(".import-dest-grid").length).toBe(3);
});

// ImportURLDialog's downloadName
test("a link's table is named after the link's file", async () =>
{
    const a = await start();
    await navigator.clipboard.writeText(new URL("resources/people.csv", import.meta.url).href);
    const grid = a.mainWindow()!.grid()!.grid;
    await keyboardMoveTo(grid, TARGET);
    await clickOnItemInBounds("[data-testid=grid]", grid, new RectangleBounds(TARGET, TARGET));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-import-url")));
    const field = await vi.waitUntil(() => document.querySelector<HTMLInputElement>(".import-link-field"), { timeout: 5000 });
    await vi.waitUntil(() => field.value !== "", { timeout: 5000 });
    await sleep(100);
    await userEvent.click(document.querySelector(".import-link-contents")!.closest("[role=dialog]")!.querySelector(".ok-button")!);
    await vi.waitUntil(() => cells(".import-dest-grid").length === 3, { timeout: 5000 });
    await ok();
    await vi.waitUntil(() => newTables(a).length === 1, { timeout: 5000 });
    expect(newTables(a)).toEqual(["people"]);
});
