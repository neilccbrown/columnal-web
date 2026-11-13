// The Calculate path (docs/gui-spec/transformations.md): the transformation and table pickers (picking a
// table by typing its name or clicking it in the grid), the column dialog (picking a column from the
// grid into the expression or the name), a Calculate's add-column arrow and header, and the column
// dialog's fixes which are actions.
import { afterEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import type { EditableColumn } from "../../../src/engine/data/data/EditableColumn.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { MemoryNumericColumn } from "../../../src/engine/data/data/MemoryNumericColumn.js";
import type { RecordSet } from "../../../src/engine/data/data/RecordSet.js";
import { Table } from "../../../src/engine/data/data/Table.js";
import type { Expression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { FunctionList } from "../../../src/engine/functions/transformations/function/FunctionList.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import { HashMap } from "../../../src/engine/java/HashMap.js";
import { Decimal, ZERO } from "../../../src/engine/java/JavaBigDecimal.js";
import { Calculate } from "../../../src/engine/transformations/transformations/Calculate.js";
import { NumberInfo } from "../../../src/engine/types/data/datatype/NumberInfo.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import { RectangleBounds } from "../../../src/gui-logic/stf/gui/grid/RectangleBounds.js";
import { TFunctionUtil } from "../../engine/tests-functions/fixtures/functions/TFunctionUtil.js";
import { clickOnItemInBounds } from "../base/clickTableLocation.js";
import { push, write } from "../base/keyboard.js";
import { keyboardMoveTo } from "../base/scrollTo.js";
import { sleep } from "../base/util.js";
import { closeApp, engineHost, renderApp, savedFile, waitForLoaded, type RenderedApp } from "../fixtures/app.js";

let app: RenderedApp | null = null;
afterEach(async () =>
{
    if (app !== null)
        await closeApp(app);
    app = null;
});

// Table T (A and B, numbers) at the top left; with a Calculate C of it (D = A * 2), if asked
async function start(withCalc: boolean = false): Promise<RenderedApp>
{
    const content = savedFile(mgr =>
    {
        const columns: ((rs: RecordSet) => EditableColumn)[] = [
            rs => new MemoryNumericColumn(rs, new ColumnId("A"), NumberInfo.DEFAULT, [Either.right(new Decimal(1)), Either.right(new Decimal(2))], ZERO),
            rs => new MemoryNumericColumn(rs, new ColumnId("B"), NumberInfo.DEFAULT, [Either.right(new Decimal(10)), Either.right(new Decimal(20))], ZERO),
        ];
        mgr.record(new ImmediateDataSource(mgr, new Table.InitialLoadDetails(new TableId("T"), null, CellPosition.ORIGIN.offsetByRowCols(1, 1), null), new EditableRecordSet(columns, () => 2)));
        if (withCalc)
        {
            const functions = FunctionList.getFunctionLookup(mgr.getUnitManager());
            mgr.record(new Calculate(mgr, new Table.InitialLoadDetails(new TableId("C"), null, CellPosition.ORIGIN.offsetByRowCols(1, 5), null), new TableId("T"), new HashMap<ColumnId, Expression>([[new ColumnId("D"), TFunctionUtil.parseExpression("A * 2", mgr.getTypeManager(), functions)]])));
        }
    });
    const a = app = await renderApp([{ name: "P", content }], 0);
    await waitForLoaded();
    await vi.waitUntil(() => document.querySelectorAll(".table").length === (withCalc ? 2 : 1));
    document.querySelector<HTMLElement>("[data-testid=grid]")!.focus();
    return a;
}

// C's add-column arrows are the rightmost (the arrows aren't in their table's element)
const calcArrow = (): HTMLElement => [...document.querySelectorAll<HTMLElement>(".expand-arrow.expand-right")].sort((x, y) => y.getBoundingClientRect().left - x.getBoundingClientRect().left)[0]!;

const tables = (a: RenderedApp): string[] => engineHost(a).tableManager.getAllTables().map(t => t.getId().getRaw());

// New ▸ Transform at an empty cell
async function newTransform(a: RenderedApp, pos: CellPosition): Promise<void>
{
    const grid = a.mainWindow()!.grid()!.grid;
    await keyboardMoveTo(grid, pos);
    await clickOnItemInBounds("[data-testid=grid]", grid, new RectangleBounds(pos, pos));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-new-transform")));
}

describe("The Calculate path", () =>
{
    test("Transform shows the transformations, of which all but Edit and R are built; it then asks for the table", async () =>
    {
        const a = await start();
        await newTransform(a, new CellPosition(CellPosition.row(2), CellPosition.col(6)));
        const buttons = await vi.waitUntil(() => [...document.querySelectorAll<HTMLButtonElement>(".pick-transformation-tile-pane .explanation-button")].filter(b => b.textContent.length > 0));
        expect(buttons.map(b => b.querySelector(".explanation-button-title")!.textContent)).toEqual(
            ["Calculate", "Aggregate", "Filter rows", "Sort rows", "Join", "Concatenate", "Exclude columns", "Edit", "R expression"]);
        expect(buttons.filter(b => !b.disabled).map(b => b.className)).toEqual(["calculate", "aggregate", "filter", "sort", "join", "concatenate", "hideColumns"].map(n => expect.stringContaining("id-transform-" + n)));
        await userEvent.click(document.querySelector(".id-transform-calculate")!);
        const field = await vi.waitUntil(() => document.activeElement?.classList.contains("pick-table-field") === true ? document.activeElement as HTMLInputElement : null);
        // The instruction above it, and the tables' names as completions:
        expect(document.querySelector(".instruction-label")?.textContent).toContain("Click on a table or type table name");
        await write("Q");
        await vi.waitUntil(() => document.querySelector(".autocomplete") === null);
        await push("Backspace");
        await write("T");
        expect([...document.querySelectorAll(".autocomplete .completion-cell-text")].map(e => e.textContent)).toEqual(["T"]);
        expect(field.value).toBe("T");
        await push("ArrowDown");
        expect(document.querySelector(".completion-cell.selected")?.textContent).toContain("T");
        await push("Enter");
        // The Calculate is made, and its first column's dialog shows, with its message:
        await vi.waitUntil(() => tables(a).length === 2);
        await vi.waitUntil(() => document.querySelector(".edit-column-top-message")?.textContent.trim() === "Enter the details for the first column to calculate.", { timeout: 5000 });
    });

    test("the table to transform can be picked by clicking it in the grid, which highlights it with an arrow to the dialog", async () =>
    {
        const a = await start();
        await newTransform(a, new CellPosition(CellPosition.row(2), CellPosition.col(6)));
        await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-transform-calculate")));
        await vi.waitUntil(() => document.querySelector(".pick-table-field") !== null);
        // The dialog isn't modal (no dimming), and the grid is covered by the picking pane:
        expect(document.querySelector(".light-dialog-overlay")).toBeNull();
        const pane = document.querySelector<HTMLElement>("[data-testid=pick-pane]")!;
        const tableBox = document.querySelector('[data-table="T"] .table-title')!.getBoundingClientRect();
        const point = { x: tableBox.left + 10, y: tableBox.top + 5 };
        pane.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: point.x, clientY: point.y }));
        await vi.waitUntil(() => document.querySelector(".pick-table-overlay.pick-select") !== null);
        expect(document.querySelector(".table-highlight-arrow.pick-select")).not.toBeNull();
        expect(pane.style.cursor).toBe("pointer");
        // Off any table, nothing:
        pane.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: point.x + 600, clientY: point.y + 300 }));
        await vi.waitUntil(() => document.querySelector(".pick-table-overlay") === null);
        pane.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: point.x, clientY: point.y }));
        pane.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: point.x, clientY: point.y, button: 0 }));
        await vi.waitUntil(() => tables(a).length === 2);
        // (Once the engine has given what the dialog needs)
        await vi.waitUntil(() => document.querySelector(".expression-editor") !== null, { timeout: 5000 });
        await vi.waitUntil(() => document.querySelector(".pick-table-field") === null);
    });

    test("in the column dialog, a column clicked in the grid goes into the expression, or the name", async () =>
    {
        await start(true);
        // Editing C's D, from its header:
        const header = [...document.querySelectorAll<HTMLElement>('[data-table="C"] .column-name')].find(e => e.textContent.trim() === "D")!;
        await userEvent.click(header);
        await vi.waitUntil(() => document.activeElement?.classList.contains("column-name-text-field") === true);
        expect((document.activeElement as HTMLInputElement).value).toBe("D");
        await push("Tab");
        await vi.waitUntil(() => document.activeElement?.closest(".expression-editor") !== null);
        await push("End");
        await write("+");
        const pane = document.querySelector<HTMLElement>("[data-testid=pick-pane]")!;
        const column = (table: string, name: string): DOMRect => [...document.querySelectorAll<HTMLElement>(`[data-table="${table}"] .column-name`)].find(e => e.textContent.trim() === name)!.getBoundingClientRect();
        const b = column("T", "B");
        pane.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: b.left + 5, clientY: b.top + 5 }));
        await vi.waitUntil(() => document.querySelector(".pick-table-overlay.pick-select") !== null);
        pane.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: b.left + 5, clientY: b.top + 5, button: 0 }));
        await sleep(100);
        const editorText = (): string => document.querySelector(".expression-editor .cm-content")!.textContent.replaceAll(" ", "");
        await vi.waitUntil(() => editorText() === "A*2+B");
        // The column being edited, D, can't be picked:
        const d = column("C", "D");
        pane.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: d.left + 5, clientY: d.top + 5 }));
        await vi.waitUntil(() => document.querySelector(".pick-table-overlay") === null);
        // Into the name: a column of the source
        (document.querySelector(".column-name-text-field") as HTMLElement).focus();
        pane.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: b.left + 5, clientY: b.top + 5 }));
        await vi.waitUntil(() => document.querySelector(".pick-table-overlay.pick-select") !== null);
        pane.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: b.left + 5, clientY: b.top + 5, button: 0 }));
        await vi.waitUntil(() => (document.querySelector(".column-name-text-field") as HTMLInputElement).value === "B");
    });

    test("a Calculate's add-column arrow adds a column, and its header edits one", async () =>
    {
        const a = await start(true);
        await userEvent.click(calcArrow());
        await vi.waitUntil(() => document.activeElement?.classList.contains("column-name-text-field") === true);
        await write("E");
        await push("Tab");
        await write("B-A");
        await userEvent.click(document.querySelector(".ok-button")!);
        await vi.waitUntil(() => (engineHost(a).tableManager.getSingleTableOrNull(new TableId("C")) as Calculate | null)?.getCalculatedColumns().size === 2);
        await vi.waitUntil(() => document.querySelector(".expression-editor") === null);
        // Editing D, renaming it:
        const header = [...document.querySelectorAll<HTMLElement>('[data-table="C"] .column-name')].find(e => e.textContent.trim() === "D")!;
        await userEvent.click(header);
        await vi.waitUntil(() => document.activeElement?.classList.contains("column-name-text-field") === true);
        await userEvent.keyboard("{Control>}a{/Control}{Meta>}a{/Meta}");
        await write("Double");
        await userEvent.click(document.querySelector(".ok-button")!);
        await vi.waitUntil(() => [...((engineHost(a).tableManager.getSingleTableOrNull(new TableId("C")) as Calculate | null)?.getCalculatedColumns().keys() ?? [])].map(c => c.getRaw()).sort().join() === "Double,E");
    });

    test("the fix moving an expression to a new Calculate closes the dialog and makes it", async () =>
    {
        const a = await start(true);
        await userEvent.click(calcArrow());
        await vi.waitUntil(() => document.activeElement?.classList.contains("column-name-text-field") === true);
        await write("E");
        await push("Tab");
        // D is C's own (not in T): referring to it is an error with the fix
        await write("column\\\\D+1");
        (document.querySelector(".column-name-text-field") as HTMLElement).focus();
        (document.querySelector(".expression-editor .cm-content") as HTMLElement).focus();
        await push("Home");
        const row = await vi.waitUntil(() => [...document.querySelectorAll<HTMLElement>(".quick-fix-row")].find(r => r.textContent.includes("Make a new calculation")));
        await userEvent.click(row);
        await vi.waitUntil(() => document.querySelector(".expression-editor") === null);
        await vi.waitUntil(() => tables(a).length === 3);
        const moved = engineHost(a).tableManager.getAllTables().find(t => t instanceof Calculate && t.getSrcTableId().getRaw() === "C") as Calculate;
        expect([...moved.getCalculatedColumns().keys()].map(c => c.getRaw())).toEqual(["E"]);
    });

    test("a unit declared by a fix in the column dialog reaches the project", async () =>
    {
        const a = await start(true);
        await userEvent.click(calcArrow());
        await vi.waitUntil(() => document.activeElement?.classList.contains("column-name-text-field") === true);
        await write("E");
        await push("Tab");
        await write("1{zzz}");
        await push("Home");
        for (let i = 0; i < 4 && [...document.querySelectorAll(".quick-fix-row")].length === 0; i++)
            await push("ArrowRight");
        const row = await vi.waitUntil(() => [...document.querySelectorAll<HTMLElement>(".quick-fix-row")].find(r => r.textContent.includes("Create unit")));
        await userEvent.click(row);
        await vi.waitUntil(() => engineHost(a).tableManager.getUnitManager().getAllDeclared().some(u => u.getName() === "zzz"));
    });
});
