// Explanations (docs/gui-spec/tables.md), beyond the port of TestExplanationDisplay: a transformation's
// cell's "Why?" (a Calculate's, an Aggregate's and a Filter's; not a data table's, or a column a
// Calculate passes through), its links, closing it, hovering an expression shown several times, and a
// Check's result (Enter on it; a passing one shows nothing).
import { afterEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { MemoryNumericColumn } from "../../../src/engine/data/data/MemoryNumericColumn.js";
import type { TableManager } from "../../../src/engine/data/data/TableManager.js";
import type { Expression } from "../../../src/engine/expressions/transformations/expression/Expression.js";
import { FunctionList } from "../../../src/engine/functions/transformations/function/FunctionList.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { HashMap } from "../../../src/engine/java/HashMap.js";
import { Decimal, ZERO } from "../../../src/engine/java/JavaBigDecimal.js";
import { Aggregate } from "../../../src/engine/transformations/transformations/Aggregate.js";
import { Calculate } from "../../../src/engine/transformations/transformations/Calculate.js";
import { Check } from "../../../src/engine/transformations/transformations/Check.js";
import { Filter } from "../../../src/engine/transformations/transformations/Filter.js";
import { NumberInfo } from "../../../src/engine/types/data/datatype/NumberInfo.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../src/engine/utility-adt/utility/adt/Pair.js";
import { GridTableDisplay } from "../../../src/gui/grid/GridTableDisplay.js";
import { TFunctionUtil } from "../../engine/tests-functions/fixtures/functions/TFunctionUtil.js";
import { push } from "../base/keyboard.js";
import { keyboardMoveTo } from "../base/scrollTo.js";
import { sleep } from "../base/util.js";
import type { RenderedApp } from "../fixtures/app.js";
import { at, closeStarted, start, tableId } from "../transformations/fixtures.js";

afterEach(closeStarted);

const parse = (mgr: TableManager, src: string): Expression => TFunctionUtil.parseExpression(src, mgr.getTypeManager(), FunctionList.getFunctionLookup(mgr.getUnitManager()));
const display = (a: RenderedApp, id: string): GridTableDisplay => a.mainWindow()!.grid()!.displays().find(d => d.info.id === id)!;
const flowText = (): string | null => document.querySelector(".explanation-flow")?.textContent ?? null;
const cell = (id: string, row: number, column: number): HTMLElement => document.querySelector<HTMLElement>(`[data-table="${id}"] .row[data-row="${row}"] .cell[data-col="${column}"]`)!;
const menuItems = (): string[] => [...document.querySelectorAll(".context-menu [role=menuitem]")].map(e => e.textContent.trim());

// T (A: 2, 1; B: "x", "y") and U, and: C, a Calculate of T (D = A * 2); G, an Aggregate of T (Total =
// sum of A); F, a Filter of T (A > 1); and N (asc: 1 to 4)
const withTransformations = async (more: (mgr: TableManager) => void = () => {}): Promise<RenderedApp> => current = await start(mgr =>
{
    mgr.record(new Calculate(mgr, at("C", 1, 9), tableId("T"), new HashMap([[new ColumnId("D"), parse(mgr, "column\\\\A * 2")]])));
    mgr.record(new Aggregate(mgr, at("G", 1, 14), tableId("T"), [new Pair(new ColumnId("Total"), parse(mgr, "@call function\\\\sum(column\\\\A)"))], []));
    mgr.record(new Filter(mgr, at("F", 8, 1), tableId("T"), parse(mgr, "column\\\\A > 1")));
    mgr.record(new ImmediateDataSource(mgr, at("N", 8, 9), new EditableRecordSet([rs => new MemoryNumericColumn(rs, new ColumnId("asc"), NumberInfo.DEFAULT, [1, 2, 3, 4].map(n => Either.right(new Decimal(n))), ZERO)], () => 4)));
    more(mgr);
});

// Moves to the cell (so that it is shown), and waits for its value
let current: RenderedApp | null = null;
async function showCell(id: string, row: number, column: number): Promise<void>
{
    const a = current!;
    await keyboardMoveTo(a.mainWindow()!.grid()!.grid, display(a, id).getPosition().offsetByRowCols(GridTableDisplay.HEADER_ROWS + row, column));
    await vi.waitUntil(() => cell(id, row, column) !== null && !cell(id, row, column).classList.contains("loading"), { timeout: 5000 });
}

// Right-clicks the cell, and waits for its menu (or for none to show)
async function cellMenu(id: string, row: number, column: number): Promise<string[]>
{
    await showCell(id, row, column);
    await userEvent.click(cell(id, row, column), { button: "right" });
    await sleep(300);
    const items = menuItems();
    if (items.length > 0)
        await push("Escape");
    return items;
}

async function why(id: string, row: number, column: number): Promise<string>
{
    await showCell(id, row, column);
    const before = flowText();
    await userEvent.click(cell(id, row, column), { button: "right" });
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-cell-why")));
    // (Once it shows, or replaces the one showing)
    return vi.waitUntil(() =>
    {
        const text = flowText();
        return text !== null && text !== "Loading..." && text !== before ? text : null;
    }, { timeout: 5000 });
}

describe("A cell's \"Why?\"", () =>
{
    test("is on a Calculate's calculated cells, not the columns it passes through, nor a data table's", async () =>
    {
        await withTransformations();
        // (After the menu's Cut, Copy and Paste)
        expect(await cellMenu("C", 0, 2)).toEqual(["Cut", "Copy", "Paste", "Why?"]);
        expect(await cellMenu("C", 0, 0)).not.toContain("Why?");
        expect(await cellMenu("T", 0, 0)).not.toContain("Why?");
    });

    test("shows how the cell was calculated, below it; a location's link selects its cell; the cross closes it", async () =>
    {
        const a = await withTransformations();
        expect(await why("C", 0, 2)).toBe("A * 2 was 4\n⬑ A was 2, using A (row 1)");
        // Below the cell, centred on its column:
        const pane = document.querySelector(".explanation-pane")!.getBoundingClientRect();
        const c = cell("C", 0, 2).getBoundingClientRect();
        expect(Math.abs((pane.left + pane.right) / 2 - (c.left + c.right) / 2)).toBeLessThan(2);
        expect(Math.round(pane.top - c.bottom)).toBe(10);
        const link = [...document.querySelectorAll<HTMLElement>(".explanation-flow .styled-text-clickable")].find(l => l.textContent === "A (row 1)")!;
        await userEvent.click(link);
        const t = display(a, "T");
        await vi.waitUntil(() => a.mainWindow()!.grid()!.grid._test_getSelection()?.getActivateTarget().equals(t.getPosition().offsetByRowCols(GridTableDisplay.HEADER_ROWS, 0)) === true);
        // (It stays)
        expect(flowText()).not.toBeNull();
        await userEvent.click(document.querySelector(".explanation-close")!);
        await vi.waitUntil(() => flowText() === null);
    });

    test("an Aggregate's and a Filter's; a middle click closes it, and another replaces it", async () =>
    {
        await withTransformations();
        expect(await why("G", 0, 0)).toContain("sum(A) was 3");
        document.querySelector(".explanation-pane")!.dispatchEvent(new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }));
        await vi.waitUntil(() => flowText() === null);
        expect(await why("F", 0, 1)).toBe("A > 1 was true\n⬑ A was 2, using A (row 1)");
        expect(await why("C", 1, 2)).toBe("A * 2 was 2\n⬑ A was 1, using A (row 2)");
        expect(document.querySelectorAll(".explanation-pane").length).toBe(1);
    });

    test("hovering an expression shown several times highlights each, with what is inside it", async () =>
    {
        await withTransformations(mgr => mgr.record(new Check(mgr, at("K", 14, 9), tableId("N"), Check.CheckType.NO_ROWS, parse(mgr, "@if (column\\\\asc + 1) > 3 @then (column\\\\asc + 1) > 4 @else (column\\\\asc + 1) > 3 @endif"))));
        await userEvent.click(await vi.waitUntil(() => document.querySelector<HTMLElement>('[data-table="K"] .check-result.explainable'), { timeout: 5000 }));
        await vi.waitUntil(() => flowText()?.startsWith("@if") === true, { timeout: 5000 });
        const parts = (text: string): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(".explanation-flow .explained-expression")].filter(e => e.textContent === text);
        // (Each token is a part: the + of each asc + 1)
        const plusOnes = parts("+");
        expect(plusOnes.length).toBeGreaterThan(1);
        await userEvent.hover(plusOnes[0]!);
        await vi.waitUntil(() => plusOnes.every(e => e.classList.contains("highlight")));
        // (With the asc inside each, but not the comparisons around them)
        expect(parts("asc").filter(e => e.classList.contains("highlight")).length).toBeGreaterThanOrEqual(plusOnes.length);
        expect(parts(">").some(e => e.classList.contains("highlight"))).toBe(false);
        await userEvent.hover(document.querySelector('[data-table="T"] .table-title')!);
        await vi.waitUntil(() => document.querySelectorAll(".explanation-flow .highlight").length === 0);
    });
});

describe("A Check's result", () =>
{
    test("Enter on a failing one shows why; it goes when the Check changes; a passing one shows nothing", async () =>
    {
        const a = await withTransformations(mgr =>
        {
            mgr.record(new Check(mgr, at("K", 14, 1), tableId("T"), Check.CheckType.STANDALONE, parse(mgr, "1 > 2")));
            mgr.record(new Check(mgr, at("P", 14, 5), tableId("T"), Check.CheckType.STANDALONE, parse(mgr, "1 < 2")));
        });
        const grid = a.mainWindow()!.grid()!.grid;
        await vi.waitUntil(() => document.querySelector('[data-table="K"] .check-result.explainable') !== null, { timeout: 5000 });
        await keyboardMoveTo(grid, new CellPosition(CellPosition.row(15), CellPosition.col(1)));
        await push("Enter");
        await vi.waitUntil(() => flowText() === "1 > 2 was false", { timeout: 5000 });
        // (Clicking it doesn't select its cell, as Java's)
        grid._test_keyboardMoveTo(new CellPosition(CellPosition.row(20), CellPosition.col(1)));
        await userEvent.click(document.querySelector('[data-table="K"] .check-result')!);
        await sleep(300);
        expect(grid._test_getSelection()?.getActivateTarget().rowIndex).toBe(20);

        // The Check changed, so the explanation goes:
        await a.mainWindow()!.engine.client.request("setCheck", "K", "STANDALONE", "1 > 3");
        await vi.waitUntil(() => flowText() === null, { timeout: 5000 });

        const passing = document.querySelector<HTMLElement>('[data-table="P"] .check-result')!;
        expect(passing.textContent.trim()).toBe("OK");
        expect(passing.classList.contains("explainable")).toBe(false);
        await userEvent.click(passing);
        await sleep(300);
        expect(flowText()).toBeNull();
    });
});
