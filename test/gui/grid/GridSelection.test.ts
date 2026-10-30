// Selecting with the mouse, losing the focus, and moving tables (docs/gui-spec/grid.md).
import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { VirtualGrid } from "../../../src/gui-logic/stf/gui/grid/VirtualGrid.js";
import { EntireTableSelection } from "../../../src/gui-logic/table-gui/gui/table/EntireTableSelection.js";
import { renderEngineGrid } from "../fixtures/engineGrid.js";
import { GRID_FIXTURE } from "../fixtures/gridFixture.js";

const pos = (row: number, column: number) => new CellPosition(CellPosition.row(row), CellPosition.col(column));
// A point in the grid (the canvas, unscrolled) at the middle of a cell:
const cellPoint = (grid: VirtualGrid, row: number, column: number) => ({ x: grid.sumColumnWidths(0, column) + 30, y: row * 24 + 12 });
const gridLocator = () => page.getByTestId("grid");

describe("grid selection", () =>
{
    it("selects a cell on a click, extends with Shift, and selects empty cells", async () =>
    {
        const { grid } = await renderEngineGrid(GRID_FIXTURE);
        const vg = grid.grid;
        // T is at column 1, row 1: its data starts at row 4.
        await userEvent.click(gridLocator(), { position: cellPoint(vg, 4, 1) });
        expect(vg.getSelection()?.isExactly(pos(4, 1))).toBe(true);
        const overlay = page.getByTestId("selection");
        await expect.element(overlay).toBeVisible();
        expect([overlay.element().getBoundingClientRect().width, overlay.element().getBoundingClientRect().height]).toEqual([100, 24]);
        await userEvent.click(gridLocator(), { position: cellPoint(vg, 6, 2), modifiers: ["Shift"] });
        const r = vg.getSelection()!.getSelectionDisplayRectangle();
        expect([r.topLeftIncl.rowIndex, r.topLeftIncl.columnIndex, r.bottomRightIncl.rowIndex, r.bottomRightIncl.columnIndex]).toEqual([4, 1, 6, 2]);
        await userEvent.click(gridLocator(), { position: cellPoint(vg, 12, 2) });
        expect(vg.getSelection()).toBeInstanceOf(VirtualGrid.EmptyCellSelection);
        expect(vg.getSelection()?.isExactly(pos(12, 2))).toBe(true);
    });

    it("selects the entire table from its name row, and leaves the column names and types alone", async () =>
    {
        const { grid } = await renderEngineGrid(GRID_FIXTURE);
        const vg = grid.grid;
        await userEvent.click(gridLocator(), { position: cellPoint(vg, 1, 1) });
        expect(vg.getSelection()).toBeInstanceOf(EntireTableSelection);
        await expect.element(page.getByText("T", { exact: true })).toBeVisible();
        expect(document.querySelector('[data-table="T"]')?.classList.contains("table-selected")).toBe(true);
        const before = vg.getSelection();
        await userEvent.click(page.getByText("Name", { exact: true }).first());
        await userEvent.click(page.getByText("Text", { exact: true }).first());
        expect(vg.getSelection()).toBe(before);
    });

    it("clears the selection when the focus leaves the grid", async () =>
    {
        const { grid, scroller } = await renderEngineGrid(GRID_FIXTURE);
        await userEvent.click(gridLocator(), { position: cellPoint(grid.grid, 4, 1) });
        expect(grid.grid.getSelection()).not.toBeNull();
        expect(document.activeElement).toBe(scroller);
        scroller.blur();
        expect(grid.grid.getSelection()).toBeNull();
        await expect.element(page.getByTestId("selection")).not.toBeInTheDocument();
    });

    it("moves a table by dragging its name row, snapping to the nearest cell, and tells the engine", async () =>
    {
        const { grid, engine } = await renderEngineGrid(GRID_FIXTURE);
        const vg = grid.grid;
        const t = grid.displays().find(d => d.info.id === "T")!;
        expect(t.getPosition().toString()).toBe(pos(1, 1).toString());
        // From 10 px into T's name row, to 10 rows lower and a little right (still nearest column 1):
        const from = { x: vg.sumColumnWidths(0, 1) + 10, y: 24 + 10 };
        await userEvent.dragAndDrop(gridLocator(), gridLocator(), { sourcePosition: from, targetPosition: { x: from.x + 30, y: from.y + 240 + 5 } });
        expect(t.getPosition().toString()).toBe(pos(11, 1).toString());
        await engine.client.whenIdle();
        expect(await engine.client.request("save")).toContain("POSITION 1 11");
        await vi.waitUntil(() => (document.querySelector('[data-table="T"]') as HTMLElement).style.top === `${11 * 24}px`);
    });

    it("scrolls while a table is dragged near an edge (nudge scrolling)", async () =>
    {
        const { grid, scroller } = await renderEngineGrid(GRID_FIXTURE);
        const vg = grid.grid;
        const view = scroller.getBoundingClientRect();
        const title = document.querySelector('[data-table="T"] .table-title')!;
        const init = { bubbles: true, pointerId: 1, button: 0, buttons: 1 };
        const start = { clientX: view.left + vg.sumColumnWidths(0, 1) + 10, clientY: view.top + 34 };
        title.dispatchEvent(new PointerEvent("pointerdown", { ...init, ...start }));
        // Within 5 px of the bottom edge: 500 px/s
        scroller.dispatchEvent(new PointerEvent("pointermove", { ...init, clientX: start.clientX, clientY: view.top + scroller.clientHeight - 2 }));
        await vi.waitUntil(() => scroller.scrollTop >= 100, { timeout: 2000 });
        const scrolled = scroller.scrollTop;
        // Away from the edges, it stops:
        scroller.dispatchEvent(new PointerEvent("pointermove", { ...init, clientX: start.clientX, clientY: view.top + 200 }));
        await new Promise(resolve => setTimeout(resolve, 300));
        expect(scroller.scrollTop).toBeLessThan(scrolled + 60);
        const stopped = scroller.scrollTop;
        await new Promise(resolve => setTimeout(resolve, 300));
        expect(scroller.scrollTop).toBe(stopped);
        scroller.dispatchEvent(new PointerEvent("pointerup", { ...init, buttons: 0, clientX: start.clientX, clientY: view.top + 200 }));
        // Dropped lower down, by as much as it scrolled:
        expect(grid.displays().find(d => d.info.id === "T")!.getPosition().rowIndex).toBeGreaterThan(5);
    });
});
