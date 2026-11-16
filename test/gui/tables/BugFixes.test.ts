// Tests of the Java bugs fixed in the tables' cells and explanations (each fails without its fix; see the
// "bug fix" PORT-NOTEs).
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { TableManager } from "../../../src/engine/data/data/TableManager.js";
import { FunctionList } from "../../../src/engine/functions/transformations/function/FunctionList.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { HashMap } from "../../../src/engine/java/HashMap.js";
import { Calculate } from "../../../src/engine/transformations/transformations/Calculate.js";
import { DataTypeUtility } from "../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { GridTableDisplay } from "../../../src/gui/grid/GridTableDisplay.js";
import { TFunctionUtil } from "../../engine/tests-functions/fixtures/functions/TFunctionUtil.js";
import { copyToClipboard } from "../base/clipboard.js";
import { keyboardMoveTo } from "../base/scrollTo.js";
import { engineHost, type RenderedApp } from "../fixtures/app.js";
import { at, closeStarted, settled, start, table, tableId } from "../transformations/fixtures.js";

afterEach(closeStarted);

const cell = (id: string, row: number, column: number): HTMLElement | null => document.querySelector<HTMLElement>(`[data-table="${id}"] .row[data-row="${row}"] .cell[data-col="${column}"]`);
const value = (a: RenderedApp, id: string, row: number, column: string): string => DataTypeUtility.valueToString(table(a, id).getData().getColumn(new ColumnId(column)).getType().getCollapsed(row));

async function cellMenuItem(a: RenderedApp, id: string, row: number, column: number, itemClass: string): Promise<void>
{
    const display = a.mainWindow()!.grid()!.displays().find(d => d.info.id === id)!;
    await keyboardMoveTo(a.mainWindow()!.grid()!.grid, display.getPosition().offsetByRowCols(GridTableDisplay.HEADER_ROWS + row, column));
    const target = await vi.waitUntil(() => cell(id, row, column), { timeout: 5000 });
    await userEvent.click(target, { button: "right" });
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".context-menu ." + itemClass), { timeout: 5000 }));
}

// GridTableDisplay.copyCell, cutCell and pasteIntoCell (Java: TextEditorBase's cut, copy and paste)
test("a cell's menu's Copy copies it, Cut copies it then clears it, and Paste stores the clipboard's text in it", async () =>
{
    const a = await start();
    expect(await copyToClipboard(() => cellMenuItem(a, "T", 0, 1, "id-copy"))).toBe("\"x\"");
    expect(await copyToClipboard(() => cellMenuItem(a, "T", 0, 0, "id-cut"))).toBe("2");
    await vi.waitUntil(() => value(a, "T", 0, "A") === "0", { timeout: 5000 });
    await navigator.clipboard.writeText("7");
    await cellMenuItem(a, "T", 1, 0, "id-paste");
    await vi.waitUntil(() => value(a, "T", 1, "A") === "7", { timeout: 5000 });
    await settled(a);
    expect(cell("T", 1, 0)?.textContent.trim()).toBe("7");
});

// MainWindow's explanation (Java: View.removeExplanationDisplayFor, called only by CheckDisplay)
test("a cell's \"Why?\" goes when its table is deleted", async () =>
{
    const parse = (mgr: TableManager, src: string) => TFunctionUtil.parseExpression(src, mgr.getTypeManager(), FunctionList.getFunctionLookup(mgr.getUnitManager()));
    const a = await start(mgr => mgr.record(new Calculate(mgr, at("C", 1, 9), tableId("T"), new HashMap([[new ColumnId("D"), parse(mgr, "column\\\\A * 2")]]))));
    await cellMenuItem(a, "C", 0, 2, "id-cell-why");
    await vi.waitUntil(() => document.querySelector(".explanation-flow")?.textContent.startsWith("A * 2") === true, { timeout: 5000 });
    await a.mainWindow()!.engine.client.request("deleteTable", "C");
    await vi.waitUntil(() => engineHost(a).tableManager.getSingleTableOrNull(tableId("C")) === null);
    await vi.waitUntil(() => document.querySelector(".explanation-flow") === null, { timeout: 5000 });
});
