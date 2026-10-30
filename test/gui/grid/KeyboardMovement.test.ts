// Port of TestKeyboardMovement (tests-gui-grid): moving the selection with the keyboard is consistent
// (right always selects more to the right, etc.) and reversible, keeps the selection in view, and gets
// to any cell.  (The logic is also tested without the GUI in test/gui-logic/stf/Grid.test.ts.)
import { expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import type { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import type { RectangleBounds } from "../../../src/gui-logic/stf/gui/grid/RectangleBounds.js";
import type { VirtualGrid } from "../../../src/gui-logic/stf/gui/grid/VirtualGrid.js";
import { GenRandom } from "../../engine/tests-basic/fixtures/gen/GenRandom.js";
import { TTableUtil } from "../../engine/tests-tables/fixtures/TTableUtil.js";
import { GenImmediateData } from "../../engine/tests-tables/fixtures/gen/GenImmediateData.js";
import { checkProperty } from "../../support/quickcheck.js";
import { keyboardMoveToTableCell } from "../base/scrollTo.js";
import { renderEngineGrid } from "../fixtures/engineGrid.js";
import { isMac } from "../../../src/gui/shortcuts.js";

const gen = () => new GenImmediateData({ numTables: { minTables: 3, maxTables: 5 } });
const rect = (grid: VirtualGrid): RectangleBounds => grid.getSelection()!.getSelectionDisplayRectangle();

// (After the smooth scroll that brings the selection into view)
async function checkSelectionOnScreen(prefix: string, scroller: HTMLElement): Promise<void>
{
    expect(document.activeElement, prefix).toBe(scroller);
    const view = scroller.getBoundingClientRect();
    // Incidental check that the grid node should not be massive:
    expect(view.width, prefix).toBeLessThan(2000);
    expect(view.height, prefix).toBeLessThan(2000);
    // Selection must be at least part in view (a whole table selection may not all fit):
    const inView = (): boolean =>
    {
        const sel = document.querySelector("[data-testid=selection]")?.getBoundingClientRect();
        return sel !== undefined && sel.left < view.right && sel.right > view.left && sel.top < view.bottom && sel.bottom > view.top;
    };
    await expect.poll(inView, { message: prefix, timeout: 2000 }).toBe(true);
}

test("testKeyboardMovement", async () =>
{
    await checkProperty([gen(), new GenRandom()], async (src: GenImmediateData.ImmediateData_Mgr, r: JavaRandom) =>
    {
        const { grid, scroller, unmount } = await renderEngineGrid(TTableUtil.save(src.mgr));
        try
        {
            const virtualGrid = grid.grid;
            scroller.focus();
            await userEvent.keyboard(isMac() ? "{Meta>}{Home}{/Meta}" : "{Control>}{Home}{/Control}");
            expect(rect(virtualGrid).contains(CellPosition.ORIGIN.offsetByRowCols(1, 1))).toBe(true);
            await checkSelectionOnScreen("Origin", scroller);
            // We go for a random walk right/down, then check that it is reversible:
            const paths: [string[], RectangleBounds][] = [];
            for (let i = 0; i < 12; i++)
            {
                const dist = 1 + r.nextInt(5);
                const presses: string[] = Array.from({ length: dist }, () => r.nextInt(3) !== 1 ? "ArrowDown" : "ArrowRight");
                let rectangleBounds = rect(virtualGrid);
                const kept: string[] = [];
                for (let key of presses)
                {
                    // Don't go RIGHT out of a table header as this can create an irreversible path:
                    if (rectangleBounds.topLeftIncl.columnIndex !== rectangleBounds.bottomRightIncl.columnIndex)
                        key = "ArrowDown";
                    await userEvent.keyboard(`{${key}}`);
                    // If we've reached edge, don't count keypress on the reverse trip:
                    const newRectangleBounds = rect(virtualGrid);
                    if (!newRectangleBounds.equals(rectangleBounds))
                        kept.push(key);
                    rectangleBounds = newRectangleBounds;
                }
                if (paths.length === 0 || !paths.at(-1)![1].equals(rectangleBounds))
                    paths.push([kept, rectangleBounds]);
                await checkSelectionOnScreen(rectangleBounds.toString(), scroller);
            }
            for (let i = paths.length - 1; i >= 0; i--)
            {
                expect(rect(virtualGrid).toString(), "Index " + i).toBe(paths[i]![1].toString());
                const keys = paths[i]![0];
                for (let k = keys.length - 1; k >= 0; k--)
                    await userEvent.keyboard(keys[k] === "ArrowDown" ? "{ArrowUp}" : "{ArrowLeft}");
                await checkSelectionOnScreen("Index " + i, scroller);
            }
            // Should be back at origin:
            expect(rect(virtualGrid).contains(CellPosition.ORIGIN.offsetByRowCols(1, 1))).toBe(true);
        }
        finally
        {
            unmount();
        }
    }, { trials: 5 });
}, 300_000);

test("testKeyboardScrollTo", async () =>
{
    await checkProperty([gen(), new GenRandom()], async (src: GenImmediateData.ImmediateData_Mgr, r: JavaRandom) =>
    {
        const { grid, scroller, unmount } = await renderEngineGrid(TTableUtil.save(src.mgr));
        try
        {
            scroller.focus();
            const displays = grid.displays();
            for (let i = 0; i < 6; i++)
            {
                const display = displays[r.nextInt(displays.length)]!;
                const col = r.nextInt(display.info.columnNames.length);
                const length = display.currentKnownRows;
                if (length <= 0) // Can happen with empty table, just skip
                    continue;
                const row = r.nextInt(length);
                const target = await keyboardMoveToTableCell(grid.grid, display, row, col);
                expect(grid.grid.getSelection()?.isExactly(target), `Selected is ${String(grid.grid.getSelection())} aiming for ${target.toString()}`).toBe(true);
            }
        }
        finally
        {
            unmount();
        }
    }, { trials: 5 });
}, 300_000);
