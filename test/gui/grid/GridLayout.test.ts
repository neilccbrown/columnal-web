// The table canvas (docs/gui-spec/grid.md): the web versions of TestVirtualGridLayout's screen checks
// (its overlap checks are in test/gui-logic/stf/Grid.test.ts), and the sticky headers and row labels.
import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { nextTick } from "vue";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { renderEngineGrid } from "../fixtures/engineGrid.js";
import { wideTableFile } from "../fixtures/wideTable.js";

const WINDOW_WIDTH = 810;
const WINDOW_HEIGHT = 600;

async function renderGrid(file: string)
{
    const rendered = await renderEngineGrid(file, WINDOW_WIDTH, WINDOW_HEIGHT);
    await vi.waitUntil(() => document.querySelector(".cell.stf-cell-number:not(.loading)") !== null);
    return rendered;
}

const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
async function scrollBy(scroller: HTMLElement, dx: number, dy: number): Promise<void>
{
    scroller.scrollBy({ left: dx, top: dy, behavior: "instant" });
    await frame();
    await frame();
    await nextTick();
}

describe("grid layout", () =>
{
    it("doesn't lay out again when the mouse moves over it (testBlankNoLayout, testCellsNoLayout)", async () =>
    {
        const { grid } = await renderGrid(wideTableFile(400, 60));
        const before = grid._test_windowChanges();
        await userEvent.hover(page.getByTestId("grid"), { position: { x: 0, y: 0 } });
        await userEvent.hover(page.getByTestId("grid"), { position: { x: 500, y: 500 } });
        expect(grid._test_windowChanges()).toBe(before);
    });

    it("lays out again only for large scrolls, once each way (testCellsScroll)", async () =>
    {
        const { grid, scroller } = await renderGrid(wideTableFile(400, 60));
        // Y, then X, then both:
        for (const [xf, yf] of [[0, 1], [1, 0], [1, 1]] as const)
        {
            const before = grid._test_windowChanges();
            for (const by of [1, 100])
            {
                await scrollBy(scroller, by * xf, by * yf);
                await scrollBy(scroller, -by * xf, -by * yf);
            }
            expect(grid._test_windowChanges(), `small and medium, ${xf} ${yf}`).toBe(before);
            await scrollBy(scroller, 1000 * xf, 1000 * yf);
            await scrollBy(scroller, -1000 * xf, -1000 * yf);
            expect(grid._test_windowChanges(), `large, ${xf} ${yf}`).toBe(before + 2);
        }
    });

    it("doesn't fetch rows again when scrolling back (testCellAllocation)", async () =>
    {
        const { grid, scroller } = await renderGrid(wideTableFile(400, 60));
        const display = grid.displays()[0]!;
        const fetches = () => [...display._test_fetches.values()];
        const before = fetches().reduce((a, b) => a + b, 0);
        await scrollBy(scroller, 100, 100);
        await scrollBy(scroller, -100, -100);
        expect(fetches().reduce((a, b) => a + b, 0)).toBe(before);
        await scrollBy(scroller, 1000, 1000);
        await vi.waitUntil(() => document.querySelector(".cell.loading") === null);
        await scrollBy(scroller, -1000, -1000);
        await vi.waitUntil(() => document.querySelector(".cell.loading") === null);
        expect(Math.max(...fetches())).toBe(1);
    });

    it("keeps the grid lines on the column edges while scrolling (testGridLines)", async () =>
    {
        const { scroller } = await renderGrid(wideTableFile(10, 3));
        const canvas = scroller.firstElementChild as HTMLElement;
        for (let i = 0; i < 100; i++)
        {
            await scrollBy(scroller, 29, 0);
            const xs = [...canvas.querySelectorAll<HTMLElement>(".grid-vline")].map(l => parseFloat(l.style.left));
            // In view: the first column is 20 px, the rest 100 px, so the lines are at 19, 119, 219, ...:
            expect(xs.length).toBeGreaterThanOrEqual(Math.ceil(WINDOW_WIDTH / 100));
            for (const x of xs)
                expect((x + 1 - 20) % 100).toBe(0);
            expect(new Set(xs).size).toBe(xs.length);
            expect(Math.min(...xs)).toBeLessThanOrEqual(scroller.scrollLeft + 100);
            expect(Math.max(...xs)).toBeGreaterThanOrEqual(scroller.scrollLeft + scroller.clientWidth - 1);
        }
        // The row lines are the canvas's background, every 24 px, and it covers the view:
        expect(getComputedStyle(canvas).backgroundSize).toBe("100% 24px");
        for (let i = 0; i < 20; i++)
        {
            await scrollBy(scroller, 0, 7);
            expect(canvas.offsetHeight).toBeGreaterThanOrEqual(scroller.scrollTop + scroller.clientHeight);
        }
    });

    it("puts each cell where the grid says, also after the table moves (testTableMove)", async () =>
    {
        const { grid, scroller } = await renderGrid(wideTableFile(40, 12));
        const display = grid.displays()[0]!;
        const canvas = scroller.firstElementChild as HTMLElement;
        for (let i = 0; i < 2; i++)
        {
            const origin = canvas.getBoundingClientRect();
            const pos = display.getPosition();
            const cells = [...canvas.querySelectorAll<HTMLElement>(".cell.stf-cell-number:not(.loading)")];
            expect(cells.length).toBeGreaterThan(20);
            for (const cell of cells)
            {
                // C<column> has row * 1000 + column:
                const value = Number(cell.textContent);
                const row = Math.floor(value / 1000), column = value % 1000;
                const box = cell.getBoundingClientRect();
                expect([box.left - origin.left, box.top - origin.top]).toEqual([
                    grid.grid.sumColumnWidths(0, pos.columnIndex + column),
                    (pos.rowIndex + 3 + row) * 24,
                ]);
            }
            display.setPosition(new CellPosition(CellPosition.row(3), CellPosition.col(5)));
            await nextTick();
        }
    });

    it("keeps the column names at the top, and the row labels at the left, while the table is in view", async () =>
    {
        const { scroller } = await renderGrid(wideTableFile(400, 60));
        await scrollBy(scroller, 2000, 3000);
        const view = scroller.getBoundingClientRect();
        const name = page.getByText("C22", { exact: true }).element().getBoundingClientRect();
        expect(name.top).toBe(view.top);
        const label = page.getByText("130", { exact: true }).element().getBoundingClientRect();
        expect(label.left).toBe(view.left);
    });

    it("resizes a column by dragging its edge in the bar above, and fits it to its header on a double click", async () =>
    {
        const { grid, scroller } = await renderGrid(wideTableFile(10, 5));
        const bar = page.getByTestId("column-resize-bar");
        const cellLeft = (text: string) => page.getByText(text, { exact: true }).element().getBoundingClientRect().left;
        // The table is at column 1, so C0 is column 1, whose right edge is at 20 + 100:
        const before = cellLeft("2001");
        await userEvent.dragAndDrop(bar, bar, { sourcePosition: { x: 120, y: 5 }, targetPosition: { x: 170, y: 5 } });
        expect(grid.grid.getColumnWidth(1)).toBe(150);
        await vi.waitUntil(() => cellLeft("2001") === before + 50);
        // The first column (20 px) can't be resized:
        await userEvent.dragAndDrop(bar, bar, { sourcePosition: { x: 20, y: 5 }, targetPosition: { x: 60, y: 5 } });
        expect(grid.grid.getColumnWidth(0)).toBe(20);
        // A double click fits C1 (column 2) to its name and type labels:
        await userEvent.dblClick(bar, { position: { x: 270, y: 5 } });
        const name = scroller.querySelector<HTMLElement>('.column-name[data-abs-col="2"]')!;
        expect(name.textContent.trim()).toBe("C1");
        // (Wide enough for the type, "Number", and narrower than the default 100)
        const width = grid.grid.getColumnWidth(2);
        expect(width).toBeGreaterThan(30);
        expect(width).toBeLessThan(100);
        await vi.waitUntil(() => name.offsetWidth === width);
        const type = scroller.querySelector<HTMLElement>('.column-type[data-abs-col="2"]')!;
        expect(type.scrollWidth).toBeLessThanOrEqual(type.clientWidth);
    });
});
