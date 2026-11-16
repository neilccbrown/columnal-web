// Java: ImportChoicesDialog.SrcDataDisplay's selection of the source (its trim), as grid cells, and the
// dialog's undo of selection changes.  The source grid has the row labels in column 0 and the column
// names in row 1, so its data starts at row 2, column 1 (Java: the display at (1, 1), whose data the
// selection can't go above: row 2).  The preview is placed two rows above the selection's top, at its
// left (Java: destData.setPosition), so that its names and types are above its rows, which line up with
// the source's.
import type { ImportTrim } from "../../engine/protocol.js";

export const DATA_TOP = 2;
export const DATA_LEFT = 1;

/** Grid cells, inclusive (Java: RectangleBounds). */
export interface Bounds
{
    readonly top: number;
    readonly left: number;
    readonly bottom: number;
    readonly right: number;
}

export const NO_TRIM: ImportTrim = { top: 0, bottom: 0, left: 0, right: 0 };

export const sameTrim = (a: ImportTrim | undefined, b: ImportTrim): boolean => a !== undefined && a.top === b.top && a.bottom === b.bottom && a.left === b.left && a.right === b.right;

// Java: getBottomRightIncl, of a source with the rows and columns
const lastRow = (rows: number): number => DATA_TOP + rows - 1;
const lastColumn = (columns: number): number => DATA_LEFT + columns - 1;

/** Java: setTrim's curSelectionBounds (RectangleBounds.fixBottomRight). */
export function boundsOf(trim: ImportTrim, rows: number, columns: number): Bounds
{
    const top = DATA_TOP + trim.top;
    const left = DATA_LEFT + trim.left;
    return { top, left, bottom: Math.max(top, lastRow(rows) - trim.bottom), right: Math.max(left, lastColumn(columns) - trim.right) };
}

/** Java: the mouse drag's pendingTrim, from the selection. */
export function trimOf(bounds: Bounds, rows: number, columns: number): ImportTrim
{
    return { top: bounds.top - DATA_TOP, bottom: lastRow(rows) - bounds.bottom, left: bounds.left - DATA_LEFT, right: lastColumn(columns) - bounds.right };
}

/** Java: updateDescription. */
export function describe(bounds: Bounds, rows: number, columns: number): string
{
    return "Rows ↕ " + String(-1 + bounds.top) + "-" + String(-1 + bounds.bottom) + " of " + String(rows) + ".  "
        + "Columns ↔ " + String(bounds.left) + "-" + String(bounds.right) + " of " + String(columns) + ".";
}

/** Which edges a cursor resizes (Java: calculateCursor's cursor, and FXUtility.isResizingTop etc.). */
export interface Edges
{
    readonly top: boolean;
    readonly bottom: boolean;
    readonly left: boolean;
    readonly right: boolean;
}

/**
 * Java: calculateCursor: within 5 px of the selection's box (in pixels), the edges near the point (as the
 * CSS cursor for them, "default" for none).
 */
export function edgesAt(box: { readonly x: number, readonly y: number, readonly width: number, readonly height: number }, x: number, y: number): { readonly cursor: string, readonly edges: Edges }
{
    const EXTRA = 5;
    const none = { cursor: "default", edges: { top: false, bottom: false, left: false, right: false } };
    const inX = box.x - EXTRA <= x && x <= box.x + box.width + EXTRA;
    const inY = box.y - EXTRA <= y && y <= box.y + box.height + EXTRA;
    if (!inX || !inY)
        return none;
    const topEdge = Math.abs(box.y - y) <= EXTRA;
    const bottomEdge = Math.abs(box.y + box.height - y) <= EXTRA;
    const leftEdge = Math.abs(box.x - x) <= EXTRA;
    const rightEdge = Math.abs(box.x + box.width - x) <= EXTRA;
    const edges = (top: boolean, bottom: boolean, left: boolean, right: boolean): Edges => ({ top, bottom, left, right });
    if (topEdge && leftEdge)
        return { cursor: "nw-resize", edges: edges(true, false, true, false) };
    else if (topEdge && rightEdge)
        return { cursor: "ne-resize", edges: edges(true, false, false, true) };
    else if (bottomEdge && leftEdge)
        return { cursor: "sw-resize", edges: edges(false, true, true, false) };
    else if (bottomEdge && rightEdge)
        return { cursor: "se-resize", edges: edges(false, true, false, true) };
    else if (topEdge)
        return { cursor: "n-resize", edges: edges(true, false, false, false) };
    else if (bottomEdge)
        return { cursor: "s-resize", edges: edges(false, true, false, false) };
    else if (leftEdge)
        return { cursor: "w-resize", edges: edges(false, false, true, false) };
    else if (rightEdge)
        return { cursor: "e-resize", edges: edges(false, false, false, true) };
    return none;
}

/**
 * Java: the mouse drag: the selection, resized by its edges being dragged (to the grid line nearest the
 * mouse, pos), or else from the cell pressed to pos.  Null if there is no pos.
 *
 * PORT-NOTE: bug fix: Java only kept the area below the column names, so its left edge could go onto the
 * row labels' column (a trim of -1 from the left, which imports as 0); here it is kept within the data
 * (of the rows and columns) on every side.
 */
export function dragged(current: Bounds, edges: Edges, pos: { readonly row: number, readonly column: number } | null, pressed: { readonly row: number, readonly column: number }, rows: number, columns: number): Bounds | null
{
    const within = (b: Bounds): Bounds =>
    {
        const top = Math.max(DATA_TOP, Math.min(b.top, lastRow(rows)));
        const left = Math.max(DATA_LEFT, Math.min(b.left, lastColumn(columns)));
        return { top, left, bottom: Math.max(top, Math.min(b.bottom, lastRow(rows))), right: Math.max(left, Math.min(b.right, lastColumn(columns))) };
    };
    let newTop: number, newBottom: number, newLeft: number, newRight: number;
    if (edges.top || edges.bottom || edges.left || edges.right)
    {
        newTop = current.top;
        newBottom = current.bottom;
        newLeft = current.left;
        newRight = current.right;
        if (pos !== null)
        {
            if (edges.top)
                newTop = pos.row;
            else if (edges.bottom)
                newBottom = pos.row - 1;
            if (edges.left)
                newLeft = pos.column;
            else if (edges.right)
                newRight = pos.column - 1;
        }
        newTop = Math.max(DATA_TOP, newTop);
        newBottom = Math.max(newTop, newBottom);
        newRight = Math.max(newLeft, newRight);
    }
    else
    {
        if (pos === null)
            return null;
        newTop = Math.max(DATA_TOP, Math.min(pos.row, pressed.row));
        newBottom = Math.max(DATA_TOP, Math.max(pos.row, pressed.row));
        newLeft = Math.min(pos.column, pressed.column);
        newRight = Math.max(pos.column, pressed.column);
    }
    return within({ top: newTop, left: newLeft, bottom: newBottom, right: newRight });
}

/**
 * Java: mostRecentTrimSelections, for "Undo area": the trims before the last changes (the current one
 * isn't in it), at most 31.
 */
export class TrimUndo
{
    private readonly recent: ImportTrim[] = [];

    /** Java: setTrim with addToUndoChain: the trim being replaced is remembered, unless it is the last one remembered. */
    public replacing(old: ImportTrim): void
    {
        if (!sameTrim(this.recent.at(-1), old))
        {
            while (this.recent.length + 1 >= 32)
                this.recent.shift();
            this.recent.push(old);
        }
    }

    /** Java: undoSelectionChange's pollLast. */
    public pop(): ImportTrim | null
    {
        return this.recent.pop() ?? null;
    }
}
