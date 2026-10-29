// Phase 7 (throwaway): GUI tests of the grid prototype in Vitest browser mode.  The test runs in the
// page, so it mounts the component itself and reads the engine's objects directly.
import fc from "fast-check";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-vue";
import { parseBigDecimal } from "../../../src/engine/java/JavaBigDecimal.js";
import { javaEquals } from "../../../src/engine/java/JavaObject.js";
import { Workers } from "../../../src/engine/utility/utility/Workers.js";
import GridPrototype from "../../../src/gui/prototype/grid/GridPrototype.vue";
import type { GridPrototypeApp } from "../../../src/gui/prototype/grid/GridPrototypeApp.js";
import { GRID_FIXTURE } from "../fixtures/gridFixture.js";

function load(): GridPrototypeApp
{
    let app: GridPrototypeApp | null = null;
    render(GridPrototype, { props: { fileText: GRID_FIXTURE, onReady: (a: GridPrototypeApp) => { app = a; } } });
    return app!;
}

/** A data cell: its table's name, and its column and row within the table. */
function cell(table: string, column: number, row: number): HTMLElement
{
    const e = document.querySelector<HTMLElement>(`[data-table="${table}"] .row[data-row="${row}"] .cell[data-col="${column}"]`);
    if (e === null)
        throw new Error(`No cell ${table} ${column} ${row}`);
    return e;
}

/** The value in a cell, as the engine has it. */
function value(app: GridPrototypeApp, table: string, column: string, row: number): unknown
{
    const t = app.tableManager.getAllTables().find(x => x.getId().getRaw() === table)!;
    return t.getData().getColumns().find(x => x.getName().getRaw() === column)!.getType().getCollapsed(row);
}

async function clickCell(table: string, column: number, row: number): Promise<void>
{
    // (The cells are made once the grid has been laid out)
    await vi.waitUntil(() => document.querySelector(`[data-table="${table}"] .row[data-row="${row}"] .cell[data-col="${column}"]`) !== null);
    await userEvent.click(cell(table, column, row));
}

const selection = (app: GridPrototypeApp): string | null => app.grid.getSelection()?.toString() ?? null;

test("testEnterNumber", async () =>
{
    const app = load();
    await clickCell("T", 0, 0);
    await userEvent.keyboard("123{Enter}");
    expect(javaEquals(value(app, "T", "N", 0), parseBigDecimal("123", true))).toBe(true);
    // The Calculate that depends on it is re-run:
    await vi.waitUntil(() => Workers.getTaskList().length === 0);
    await expect.poll(() => document.querySelector('[data-table="C"] .row[data-row="0"] .cell[data-col="2"]')?.textContent?.trim()).toBe("246");
    // Enter moves the selection down a row:
    expect(selection(app)).toBe("RectTableCellSel[(1, 5)->(1, 5)]");
});

test("testKeyboardMovement", async () =>
{
    const app = load();
    await clickCell("T", 0, 0);
    expect(selection(app)).toBe("RectTableCellSel[(1, 4)->(1, 4)]");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(selection(app)).toBe("RectTableCellSel[(1, 6)->(1, 6)]");
    // Out of the bottom of the table, into empty cells:
    await userEvent.keyboard("{ArrowDown}");
    expect(selection(app)).toBe("EmptyCellSelection{position=(1, 7)}");
    await userEvent.keyboard("{ArrowUp}");
    // Across an empty column into the next table:
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(selection(app)).toBe("EmptyCellSelection{position=(3, 6)}");
    await userEvent.keyboard("{ArrowRight}");
    expect(selection(app)).toBe("RectTableCellSel[(4, 6)->(4, 6)]");
    await userEvent.keyboard("{Shift>}{ArrowUp}{/Shift}");
    expect(selection(app)).toBe("RectTableCellSel[(4, 6)->(4, 5)]");
    await userEvent.keyboard("{Control>}{Home}{/Control}");
    expect(selection(app)).toBe("EntireTableSelection[(1, 1)-(2, 6)]");
});

// A decimal number as typed: an optional minus, digits, and optionally a point and more digits.
const decimalText = fc.tuple(fc.boolean(), fc.bigInt({ min: 0n, max: 10n ** 20n }), fc.option(fc.stringMatching(/^[0-9]{1,10}$/)))
    .map(([negative, whole, fraction]) => (negative ? "-" : "") + whole + (fraction !== null ? "." + fraction : ""));

test("propEnterNumbers", async () =>
{
    const app = load();
    await fc.assert(fc.asyncProperty(decimalText, async text =>
    {
        // userEvent.click(element) turns the element into a selector (here, its text), which becomes
        // ambiguous if the Calculate is re-shown with the same number in the meantime, so wait:
        await vi.waitUntil(() => Workers.getTaskList().length === 0);
        await clickCell("T", 0, 1);
        await userEvent.keyboard(text + "{Enter}");
        const stored = value(app, "T", "N", 1);
        expect(javaEquals(stored, parseBigDecimal(text, true)), `typed ${text}, stored ${String(stored)}`).toBe(true);
    }), { numRuns: 20 });
});
