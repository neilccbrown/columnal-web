// Port of the Java GUI tests' ScrollToTrait (tests-gui-base): scrollTo, which scrolls (with the mouse
// wheel) until an element is entirely in view in its scrolling ancestor, and keyboardMoveTo, which
// moves the grid's selection to a cell.
// PORT-DEFERRED: keyboardMoveTo's variants that go to a table's row sometimes through the View menu's
// "Goto row" (Phase 9, with the menus); keyboardMoveToTableCell here always uses the keyboard way.
import { expect, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import type { VirtualGrid } from "../../../src/gui-logic/stf/gui/grid/VirtualGrid.js";
import { GridTableDisplay } from "../../../src/gui/grid/GridTableDisplay.js";
import { isMac } from "../../../src/gui/shortcuts.js";
import { getFocusOwner } from "./focusOwner.js";
import { describeElement, sleep } from "./util.js";

function enclosingScroll(target: Element): HTMLElement | null
{
    for (let n = target.parentElement; n !== null; n = n.parentElement)
    {
        const style = getComputedStyle(n);
        if (/auto|scroll/.test(style.overflowX + style.overflowY))
            return n;
    }
    return null;
}

/** Scrolls until the entire element is in view (in its scrolling ancestor's visible area). */
export async function scrollTo(target: Element): Promise<void>
{
    const scroll = enclosingScroll(target);
    if (scroll === null)
        expect.fail("Could not find enclosing scroll pane for " + describeElement(target));
    const box = scroll.getBoundingClientRect();
    const view = { left: box.left + scroll.clientLeft, top: box.top + scroll.clientTop, right: 0, bottom: 0 };
    view.right = view.left + scroll.clientWidth;
    view.bottom = view.top + scroll.clientHeight;
    const targetBeforeScroll = target.getBoundingClientRect();
    const t = (): DOMRect => target.getBoundingClientRect();
    const wheel = (x: number, y: number): Promise<void> => userEvent.wheel(page.elementLocator(scroll), { delta: { x, y } });
    // We limit how many times we will scroll, to avoid an infinite loop in case of test failure:
    for (let i = 0; i < 100 && t().right > view.right; i++)
        await wheel(40, 0);
    for (let i = 0; i < 100 && t().left < view.left; i++)
        await wheel(-40, 0);
    for (let i = 0; i < 100 && t().bottom > view.bottom; i++)
        await wheel(0, 40);
    for (let i = 0; i < 100 && t().top < view.top; i++)
        await wheel(0, -40);
    const r = t();
    expect(view.left <= r.left && r.right <= view.right && view.top <= r.top && r.bottom <= view.bottom,
        `View bounds: ${JSON.stringify(view)} target: ${JSON.stringify(r)} target before scroll: ${JSON.stringify(targetBeforeScroll)}`).toBe(true);
}

/**
 * Moves the grid's selection to the target cell.  Lots of tests use this, so to speed things up it
 * usually calls the grid directly (VirtualGrid._test_keyboardMoveTo); one time in ten (decided by the
 * target) it uses the keyboard: Ctrl/Cmd+Home, then Page Down and Down to the row, then Right to the
 * column.  The grid must have the focus.
 */
export async function keyboardMoveTo(virtualGrid: VirtualGrid, target: CellPosition): Promise<void>
{
    const r = new JavaRandom(target.rowIndex * 100 + target.columnIndex);
    const bypassGUI = r.nextInt(10) !== 1;
    if (bypassGUI)
        virtualGrid._test_keyboardMoveTo(target);
    else
    {
        const pageHeight = virtualGrid.calcPageHeight();
        // Control-Home goes to 1,1 not 0,0 hence the -1 in the subsequent loops:
        await userEvent.keyboard(isMac() ? "{Meta>}{Home}{/Meta}" : "{Control>}{Home}{/Control}");
        // First go to correct row:
        for (let i = 0; i < Math.floor((target.rowIndex - 1) / pageHeight); i++)
            await userEvent.keyboard("{PageDown}");
        for (let i = 0; i < (target.rowIndex - 1) % pageHeight; i++)
            await userEvent.keyboard("{ArrowDown}");
        const maxAttempts = target.columnIndex + 1;
        for (let attempts = 0; (virtualGrid.getSelection()?.positionToEnsureInView().columnIndex ?? Number.MAX_SAFE_INTEGER) < target.columnIndex && attempts < maxAttempts; attempts++)
            await userEvent.keyboard("{ArrowRight}");
    }
    // Wait for smooth scroll to finish (a long way takes longer than Java's 300 ms):
    await sleep(300);
    await waitForScrollToStop();
    const selection = virtualGrid.getSelection();
    expect(selection !== null && (selection.isExactly(target) || selection.getActivateTarget().equals(target)),
        `Selected is ${String(selection)} aiming for ${target.toString()} focus owner is ${describeElement(getFocusOwner())}${bypassGUI ? " bypassed GUI" : " used GUI"}`).toBe(true);
}

// Waits until the grid's scroll position stays the same for 100 ms:
async function waitForScrollToStop(): Promise<void>
{
    const scroller = document.querySelector<HTMLElement>("[data-testid=grid]");
    if (scroller === null)
        return;
    let last = "";
    for (let now = `${scroller.scrollLeft},${scroller.scrollTop}`; now !== last; now = `${scroller.scrollLeft},${scroller.scrollTop}`)
    {
        last = now;
        await sleep(100);
    }
}

/** Moves to a data cell of a table (Java: keyboardMoveTo(virtualGrid, tableManager, tableId, row, col)), and returns its position. */
export async function keyboardMoveToTableCell(virtualGrid: VirtualGrid, display: GridTableDisplay, row: number, column: number): Promise<CellPosition>
{
    const target = display.getPosition().offsetByRowCols(GridTableDisplay.HEADER_ROWS + row, column);
    await keyboardMoveTo(virtualGrid, target);
    // (Java's cells were there by now; here wait for the cell's content to arrive)
    await vi.waitUntil(() => display.getCell(row, column) !== null);
    return target;
}
