// Port of xyz.columnal.gui.grid.CellSelection (stf module).
//
// PORT-NOTE: gotoRow takes the parent window in Java, for the dialog it shows; here it is the
// GUI's (unknown here).
import type { CellPosition } from "../../../../engine/data/data/CellPosition.js";
import type { Either } from "../../../../engine/utility-adt/utility/adt/Either.js";
import type { GridArea } from "./GridArea.js";
import type { RectangleBounds } from "./RectangleBounds.js";

/**
 * A selection of cells.  This might be, for example:
 * - A selection of one or more rows
 * - A selection of one or more columns
 * - The entire table
 * - A rectangular grid of cells within the table of at least 1x1
 */
export interface CellSelection
{
    // Copy the value of the selection to the clipboard, if that operation makes sense.
    doCopy(): void;

    // Paste the value of the clipboard, if that operation makes sense.
    doPaste(): void;

    // Perform a delete, if that operation makes sense.
    doDelete(): void;

    // Which position should we target if they try to activate?
    getActivateTarget(): CellPosition;

    // Extend the current selection to the given cell, return null if not possible
    extendTo(cellPosition: CellPosition): CellSelection | null;

    /**
     * Gets a new selection that is the result of pressing home on this one.
     */
    atHome(extendSelection: boolean): CellSelection;

    /**
     * Gets a new selection that is the result of pressing end on this one.
     */
    atEnd(extendSelection: boolean): CellSelection;

    /**
     * Move the selection by that number of rows and columns.  If this would result in moving outside
     * the current selection, the new position is returned in Either.left.  Otherwise, a new selection
     * is returned in Either.right
     */
    move(extendSelection: boolean, byRows: number, byColumns: number): Either<CellPosition, CellSelection>;

    /**
     * What cell should we scroll to, to ensure that the focus part of the selection is visible?
     */
    positionToEnsureInView(): CellPosition;

    /**
     * What are the display bounds of this rectangle for drawing on screen?  Only used for drawing.
     */
    getSelectionDisplayRectangle(): RectangleBounds;

    // Is the current selection the single cell supplied and nothing more?
    isExactly(cellPosition: CellPosition): boolean;

    /**
     * Does the selection include the given grid area?  Can either be worked out by
     * looking at physical area, or by casting and checking against a known table.
     */
    includes(tableDisplay: GridArea): boolean;

    // Java: gotoRow(Window parent)
    gotoRow(parent: unknown): void;

    // Called when selected or deselected
    notifySelected(selected: boolean, animateFlash: boolean): void;
}
