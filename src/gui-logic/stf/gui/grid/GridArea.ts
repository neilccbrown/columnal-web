// Port of xyz.columnal.gui.grid.GridArea (stf module).
import type { AbsRowIndex, GridAreaRowIndex } from "../../../../engine/anns/Annotations.js";
import { CellPosition } from "../../../../engine/data/data/CellPosition.js";
import { InternalException } from "../../../../engine/utility-error/error/InternalException.js";
import { Log } from "../../../../engine/utility/log/Log.js";
import { Utility } from "../../../../engine/utility/utility/Utility.js";
import type { CellSelection } from "./CellSelection.js";
import type { VirtualGrid } from "./VirtualGrid.js";

/**
 * One rectangular table area within a parent VirtualGrid.  Tracks position,
 * size, adjusts when resized.
 *
 * Overlays such as line numbers are not included in the logical bounds,
 * but column headers are included.
 *
 * No two GridArea items may overlap, and VirtualGrid will reposition to make sure
 * this is always true.
 *
 * Each GridArea is assumed to have a fixed immediately-knowable position and number of columns,
 * but a number of rows which may not be known ahead of time.
 */
export abstract class GridArea
{
    // The top left cell, which is probably a column header.
    private topLeft: CellPosition;
    private bottomRight: CellPosition;

    private parent: VirtualGrid | null = null;

    public constructor()
    {
        // Default position:
        this.topLeft = new CellPosition(CellPosition.row(1), CellPosition.col(1));
        this.bottomRight = this.topLeft;
    }

    public getPosition(): CellPosition
    {
        return this.topLeft;
    }

    public setPosition(cellPosition: CellPosition): void
    {
        this.bottomRight = this.bottomRight.offsetByRowCols(cellPosition.rowIndex - this.topLeft.rowIndex, cellPosition.columnIndex - this.topLeft.columnIndex);
        this.topLeft = cellPosition;
        this.updateParent();
    }

    protected updateParent(): void
    {
        if (this.parent !== null)
            this.parent.positionOrAreaChanged();
    }

    // Calls the consumer, iff we have a non-null parent
    protected withParent_(withVirtualGrid: (grid: VirtualGrid) => void): void
    {
        if (this.parent !== null)
            withVirtualGrid(this.parent);
    }

    protected withParent<R>(withVirtualGrid: (grid: VirtualGrid) => R): R | null
    {
        if (this.parent !== null)
            return withVirtualGrid(this.parent);
        else
            return null;
    }

    public addedToGrid(parent: VirtualGrid): void
    {
        this.parent = parent;
    }

    public _test_getParent(): VirtualGrid
    {
        if (this.parent === null)
            throw new Error("GridArea " + String(this) + " has no parent");
        return this.parent;
    }

    /**
     * Check if more rows are available, up to and including the given row number (but not beyond).
     * If you need to do a calculation off-thread, and find that you do have a new size
     * (i.e. different to the one you return from the method), call the runnable
     * @param checkUpToRowIncl The row to check up to in overall grid position
     * @param updateSizeAndPositions The runnable to call if the size later changes.
     * @return The current known row size.
     */
    protected abstract updateKnownRows(checkUpToRowIncl: GridAreaRowIndex, updateSizeAndPositions: () => void): void;

    public getAndUpdateBottomRow(checkUpToRowIncl: AbsRowIndex, updateSizeAndPositions: () => void): AbsRowIndex
    {
        const gridAreaRow: GridAreaRowIndex = checkUpToRowIncl - this.getPosition().rowIndex;
        this.updateKnownRows(gridAreaRow, updateSizeAndPositions);
        this.bottomRight = this.recalculateBottomRightIncl();
        if (this.bottomRight.rowIndex < this.topLeft.rowIndex || this.bottomRight.columnIndex < this.topLeft.columnIndex)
        {
            Log.log(new InternalException("Bottom right " + this.bottomRight.toString() + " is left/above the top left: " + this.topLeft.toString()));
            // For safety:
            this.bottomRight = new CellPosition(Utility.maxRow(this.topLeft.rowIndex, this.bottomRight.rowIndex), Utility.maxCol(this.topLeft.columnIndex, this.bottomRight.columnIndex));
        }
        return this.bottomRight.rowIndex;
    }

    protected abstract recalculateBottomRightIncl(): CellPosition;

    public contains(cellPosition: CellPosition): boolean
    {
        return this.topLeft.rowIndex <= cellPosition.rowIndex && cellPosition.rowIndex <= this.bottomRight.rowIndex
            && this.topLeft.columnIndex <= cellPosition.columnIndex && cellPosition.columnIndex <= this.bottomRight.columnIndex;
    }

    public getBottomRightIncl(): CellPosition
    {
        return this.bottomRight;
    }

    // Select a cell by moving to it using the keyboard/mouse.  Return null if not possible
    public abstract getSelectionForSingleCell(cellPosition: CellPosition): CellSelection | null;

    // When sorting grid areas, ones with a lower sort key will be put to the left.
    public abstract getSortKey(): string;
}
