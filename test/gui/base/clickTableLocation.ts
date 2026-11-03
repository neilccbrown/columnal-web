// Port of test.gui.trait.ClickTableLocationTrait (tests-gui-base): finding the one element (matching a
// selector) within a rectangle of the grid's cells, and clicking it.
import { userEvent } from "vitest/browser";
import type { RectangleBounds } from "../../../src/gui-logic/stf/gui/grid/RectangleBounds.js";
import { VirtualGrid } from "../../../src/gui-logic/stf/gui/grid/VirtualGrid.js";

interface Rect { left: number, top: number, right: number, bottom: number }

/** The client rectangle of the cells (Java: VirtualGrid.getRectangleBoundsScreen). */
export function rectangleBoundsScreen(virtualGrid: VirtualGrid, bounds: RectangleBounds): Rect
{
    const canvas = document.querySelector("[data-testid=grid] .grid-canvas")!.getBoundingClientRect();
    return {
        left: canvas.left + virtualGrid.sumColumnWidths(0, bounds.topLeftIncl.columnIndex),
        top: canvas.top + bounds.topLeftIncl.rowIndex * VirtualGrid.rowHeight,
        right: canvas.left + virtualGrid.sumColumnWidths(0, bounds.bottomRightIncl.columnIndex + 1),
        bottom: canvas.top + (bounds.bottomRightIncl.rowIndex + 1) * VirtualGrid.rowHeight,
    };
}

/**
 * The one element matching the selector (or among those given) that overlaps the cells (shrunk by two
 * pixels each way, to avoid neighbouring cells), and the centre of the overlap, in client coordinates.
 * Throws if there isn't exactly one.
 */
export function withItemInBounds(query: string | readonly Element[], virtualGrid: VirtualGrid, bounds: RectangleBounds): { element: HTMLElement, point: { x: number, y: number } }
{
    const theoretical = rectangleBoundsScreen(virtualGrid, bounds);
    // We shrink by two pixels in each direction to avoid picking up neighbouring cells, which will
    // exactly border us:
    const box = { left: theoretical.left + 2, top: theoretical.top + 2, right: theoretical.right - 2, bottom: theoretical.bottom - 2 };
    const candidates = typeof query === "string" ? [...document.querySelectorAll(query)] : query;
    const intersect = (r: DOMRect): Rect | null =>
    {
        const i = { left: Math.max(r.left, box.left), top: Math.max(r.top, box.top), right: Math.min(r.right, box.right), bottom: Math.min(r.bottom, box.bottom) };
        return i.left < i.right && i.top < i.bottom ? i : null;
    };
    const target = candidates.filter(n => intersect(n.getBoundingClientRect()) !== null);
    if (target.length === 0)
        throw new Error("Could not find node at given position, looked for " + JSON.stringify(box) + " among " + candidates.length + " items");
    if (target.length > 1)
        throw new Error("Found multiple nodes at given position: " + target.map(t => t.outerHTML.slice(0, 80)).join("\n"));
    const i = intersect(target[0]!.getBoundingClientRect())!;
    return { element: target[0] as HTMLElement, point: { x: (i.left + i.right) / 2, y: (i.top + i.bottom) / 2 } };
}

/** Clicks (with the given button) the one element matching the selector within the cells. */
export async function clickOnItemInBounds(query: string | readonly Element[], virtualGrid: VirtualGrid, bounds: RectangleBounds, button: "left" | "right" = "left"): Promise<HTMLElement>
{
    const { element, point } = withItemInBounds(query, virtualGrid, bounds);
    await clickAt(element, point, button);
    return element;
}

/**
 * Clicks at a client point (Java: clickOn(point)): on whatever is topmost there, which may be over the
 * element given (the element is used if nothing else is found).
 */
export async function clickAt(element: Element, point: { x: number, y: number }, button: "left" | "right" = "left"): Promise<void>
{
    const target = document.elementFromPoint(point.x, point.y) ?? element;
    const r = target.getBoundingClientRect();
    await userEvent.click(target, { button, position: { x: point.x - r.left, y: point.y - r.top } });
}
