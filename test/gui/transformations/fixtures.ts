// Helpers for the transformations' GUI tests: an app with tables T and U, and finding and clicking the
// parts of the page.
import { vi } from "vitest";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import type { EditableColumn } from "../../../src/engine/data/data/EditableColumn.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { MemoryNumericColumn } from "../../../src/engine/data/data/MemoryNumericColumn.js";
import { MemoryStringColumn } from "../../../src/engine/data/data/MemoryStringColumn.js";
import type { RecordSet } from "../../../src/engine/data/data/RecordSet.js";
import { Table } from "../../../src/engine/data/data/Table.js";
import type { TableManager } from "../../../src/engine/data/data/TableManager.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import { Decimal, ZERO } from "../../../src/engine/java/JavaBigDecimal.js";
import { NumberInfo } from "../../../src/engine/types/data/datatype/NumberInfo.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import { sleep } from "../base/util.js";
import { closeApp, engineHost, renderApp, savedFile, waitForLoaded, type RenderedApp } from "../fixtures/app.js";


let app: RenderedApp | null = null;

/** Closes the app start made, if any (for afterEach). */
export async function closeStarted(): Promise<void>
{
    if (app !== null)
        await closeApp(app);
    app = null;
}

export const tableId = (s: string): TableId => new TableId(s);
export const columnId = (s: string): ColumnId => new ColumnId(s);
export const at = (id: string, row: number, column: number): Table.InitialLoadDetails => new Table.InitialLoadDetails(tableId(id), null, CellPosition.ORIGIN.offsetByRowCols(row, column), null);

// Tables T and U (A, numbers, and B, text) at the top left, and any others asked for
export async function start(more: (mgr: TableManager) => void = () => {}): Promise<RenderedApp>
{
    let count = 0;
    const content = savedFile(mgr =>
    {
        const data = (id: string, column: number): void =>
        {
            const columns: ((rs: RecordSet) => EditableColumn)[] = [
                rs => new MemoryNumericColumn(rs, columnId("A"), NumberInfo.DEFAULT, [Either.right(new Decimal(2)), Either.right(new Decimal(1))], ZERO),
                rs => new MemoryStringColumn(rs, columnId("B"), [Either.right("x"), Either.right("y")], ""),
            ];
            mgr.record(new ImmediateDataSource(mgr, at(id, 1, column), new EditableRecordSet(columns, () => 2)));
        };
        data("T", 1);
        data("U", 5);
        more(mgr);
        count = mgr.getAllTables().length;
    });
    const a = app = await renderApp([{ name: "P", content }], 0);
    await waitForLoaded();
    await vi.waitUntil(() => document.querySelectorAll(".table").length === count);
    await settled(a);
    document.querySelector<HTMLElement>("[data-testid=grid]")!.focus();
    return a;
}

// (Once the engine has done its work, and the page has caught up: a click by element, made into a
// selector, wouldn't follow the tables' order on the page changing)
export async function settled(a: RenderedApp): Promise<void>
{
    await a.mainWindow()!.engine.client.request("idle");
    await sleep(200);
}

export const table = <T extends Table>(a: RenderedApp, id: string): T => engineHost(a).tableManager.getSingleTableOrThrow(tableId(id)) as T;
export const hatPart = (id: string, text: string): HTMLElement | undefined => [...document.querySelectorAll<HTMLElement>(`.table-hat[data-table="${id}"] span`)].find(e => e.textContent === text);
export const examples = (pane: Element): string[] => [...pane.querySelectorAll(".sort-direction-labels > span")].map(e => e.textContent.trim());
export const centre = (selector: string): { x: number, y: number } =>
{
    const r = document.querySelector(selector)!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};
export const columnHeader = (id: string, column: string): DOMRect => [...document.querySelectorAll<HTMLElement>(`[data-table="${id}"] .column-name`)].find(e => e.textContent.trim() === column)!.getBoundingClientRect();

// Clicks in the grid's picking pane (as a dialog picking from the grid lets the user)
export async function pickAt(box: DOMRect): Promise<void>
{
    const pane = document.querySelector<HTMLElement>("[data-testid=pick-pane]")!;
    const point = { clientX: box.left + 5, clientY: box.top + 5 };
    pane.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, ...point }));
    await vi.waitUntil(() => document.querySelector(".pick-table-overlay.pick-select") !== null);
    pane.dispatchEvent(new MouseEvent("click", { bubbles: true, ...point, button: 0 }));
}
