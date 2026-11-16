// Helpers for the importing tests: importing a file through the new-table dialog, and reading the import
// dialog's grids.
import { vi } from "vitest";
import { userEvent } from "vitest/browser";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import { DataTypeUtility } from "../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { RectangleBounds } from "../../../src/gui-logic/stf/gui/grid/RectangleBounds.js";
import { clickOnItemInBounds } from "../base/clickTableLocation.js";
import { keyboardMoveTo } from "../base/scrollTo.js";
import { sleep } from "../base/util.js";
import { engineHost, type RenderedApp } from "../fixtures/app.js";

// (Columns are 100 px, rows 24 px; the original's data starts at row 2, column 1)
export const ROW = 24;
export const WIDTH = 100;

export const TARGET = new CellPosition(CellPosition.row(8), CellPosition.col(1));
export const PEOPLE = "Name,Age\nAlice,30\nBob,41\nCarol,25\n";

// Picks the file (as the browser's file picker would) for the new-table dialog's Import File, at the cell
export async function importFile(a: RenderedApp, name: string, content: BlobPart): Promise<void>
{
    const grid = a.mainWindow()!.grid()!.grid;
    await keyboardMoveTo(grid, TARGET);
    await clickOnItemInBounds("[data-testid=grid]", grid, new RectangleBounds(TARGET, TARGET));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-import-file")));
    const input = document.querySelector<HTMLInputElement>(".import-file-input")!;
    const transfer = new DataTransfer();
    transfer.items.add(new File([content], name));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
}

export const dialogShowing = (): boolean => document.querySelector(".guess-format-content") !== null;
export const texts = (selector: string): string[] => [...document.querySelectorAll(selector)].map(e => e.textContent.trim());
export const description = (): string => document.querySelector(".import-selection-description")?.textContent ?? "";
export const cells = (grid: string): string[][] =>
{
    const byTop = new Map<number, [number, string][]>();
    for (const cell of document.querySelectorAll<HTMLElement>(`${grid} .import-data-cell`))
    {
        const top = Number.parseFloat(cell.style.top);
        byTop.set(top, [...byTop.get(top) ?? [], [Number.parseFloat(cell.style.left), cell.textContent.trim()]]);
    }
    return [...byTop.entries()].sort((x, y) => x[0] - y[0]).map(([, row]) => row.sort((x, y) => x[0] - y[0]).map(c => c[1]));
};
export const tableValues = (a: RenderedApp, id: string): string[][] =>
{
    const data = engineHost(a).tableManager.getSingleTableOrThrow(new TableId(id)).getData();
    const columns = data.getColumns();
    const r: string[][] = [];
    for (let row = 0; row < data.getLength(); row++)
        r.push(columns.map(c => DataTypeUtility.valueToString(c.getType().getCollapsed(row))));
    return r;
};
export const newTables = (a: RenderedApp): string[] => engineHost(a).tableManager.getAllTables().map(t => t.getId().getRaw()).filter(id => id !== "T" && id !== "U");

export async function ok(): Promise<void>
{
    await userEvent.click(document.querySelector(".guess-format-content")!.closest("[role=dialog]")!.querySelector(".ok-button")!);
    await vi.waitUntil(() => !dialogShowing(), { timeout: 5000 });
}

// Drags in the original from one point to another (in its canvas, in pixels), as the mouse would
export async function drag(from: { x: number, y: number }, to: { x: number, y: number }): Promise<void>
{
    const pane = document.querySelector<HTMLElement>(".import-mouse-pane")!;
    const box = pane.getBoundingClientRect();
    const at = (p: { x: number, y: number }, type: string, buttons: number): void =>
    {
        pane.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: box.left + p.x, clientY: box.top + p.y, button: 0, buttons, pointerId: 1 }));
    };
    at(from, "pointermove", 0);
    at(from, "pointerdown", 1);
    at({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, "pointermove", 1);
    at(to, "pointermove", 1);
    at(to, "pointerup", 0);
    await sleep(100);
}
