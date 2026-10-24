// Port of xyz.columnal.gui.grid.RectangularTableCellSelection (stf module).
import type { AbsColIndex } from "../../../../engine/anns/Annotations.js";
import { CellPosition } from "../../../../engine/data/data/CellPosition.js";
import { Either } from "../../../../engine/utility-adt/utility/adt/Either.js";
import { Utility } from "../../../../engine/utility/utility/Utility.js";
import type { CellSelection } from "./CellSelection.js";
import type { GridArea } from "./GridArea.js";
import { RectangleBounds } from "./RectangleBounds.js";

/**
 * A rectangular selection is constrained to one table
 * (TODO and its adjacent transforms?)
 * Immutable.
 */
export class RectangularTableCellSelection implements CellSelection
{
    private readonly startAnchor: CellPosition;
    private readonly curFocus: CellPosition;
    private readonly tableSelectionLimits: RectangularTableCellSelection.TableSelectionLimits;

    // Java has two constructors: (rowIndex, columnIndex, limits), which selects a single cell, and
    // the private (anchor, focus, limits).
    public constructor(rowIndex: number, columnIndex: number, tableSelectionLimits: RectangularTableCellSelection.TableSelectionLimits);
    public constructor(anchor: CellPosition, focus: CellPosition, tableSelectionLimits: RectangularTableCellSelection.TableSelectionLimits);
    public constructor(a: number | CellPosition, b: number | CellPosition, tableSelectionLimits: RectangularTableCellSelection.TableSelectionLimits)
    {
        if (a instanceof CellPosition)
        {
            this.startAnchor = a;
            this.curFocus = b as CellPosition;
        }
        else
        {
            // Selects a single cell:
            this.startAnchor = new CellPosition(a, b as number);
            this.curFocus = this.startAnchor;
        }
        this.tableSelectionLimits = tableSelectionLimits;
    }

    public doCopy(): void
    {
        this.tableSelectionLimits.doCopy(this.calcTopLeftIncl(), this.calcBottomRightIncl());
    }

    public doPaste(): void
    {
        // TODO paste data over the current cells, offering to extend
        // the table if needed.
    }

    public doDelete(): void
    {
        this.tableSelectionLimits.doDelete(this.calcTopLeftIncl(), this.calcBottomRightIncl());
    }

    public getActivateTarget(): CellPosition
    {
        return this.curFocus;
    }

    public atHome(extendSelection: boolean): CellSelection
    {
        const dest = new CellPosition(this.tableSelectionLimits.getTopLeftIncl().rowIndex, this.curFocus.columnIndex);
        return new RectangularTableCellSelection(extendSelection ? this.startAnchor : dest, dest, this.tableSelectionLimits);
    }

    public atEnd(extendSelection: boolean): CellSelection
    {
        const dest = new CellPosition(this.tableSelectionLimits.getBottomRightIncl().rowIndex, this.curFocus.columnIndex);
        return new RectangularTableCellSelection(extendSelection ? this.startAnchor : dest, dest, this.tableSelectionLimits);
    }

    public move(extendSelection: boolean, _byRows: number, _byColumns: number): Either<CellPosition, CellSelection>
    {
        const byRows = CellPosition.row(_byRows);
        const byColumns = CellPosition.col(_byColumns);
        const targetRow = this.curFocus.rowIndex + byRows;
        const clampedRow = Utility.maxRow(this.tableSelectionLimits.getTopLeftIncl().rowIndex, Utility.minRow(this.tableSelectionLimits.getBottomRightIncl().rowIndex, targetRow));
        const targetColumn = this.curFocus.columnIndex + byColumns;
        const clampedColumn = Utility.maxCol(this.tableSelectionLimits.getTopLeftIncl().columnIndex, Utility.minCol(this.tableSelectionLimits.getBottomRightIncl().columnIndex, targetColumn));

        // If we're trying to move outside without holding shift, do so:
        if ((clampedRow !== targetRow || clampedColumn !== targetColumn) && !extendSelection)
        {
            return Either.left(new CellPosition(targetRow, targetColumn));
        }
        else
        {
            // If we are all within bounds, or doing shift-selection, we stay in the table:
            const dest = new CellPosition(clampedRow, clampedColumn);
            // Move from top-left:
            return Either.right(new RectangularTableCellSelection(extendSelection ? this.startAnchor : dest, dest, this.tableSelectionLimits));
        }
    }

    public extendTo(pos: CellPosition): CellSelection | null
    {
        const topLeft = this.tableSelectionLimits.getTopLeftIncl();
        const bottomRight = this.tableSelectionLimits.getBottomRightIncl();
        if (new RectangleBounds(topLeft, bottomRight).contains(pos))
        {
            // It's possible
            return new RectangularTableCellSelection(this.startAnchor, pos, this.tableSelectionLimits);
        }
        else
            return null;
    }

    public positionToEnsureInView(): CellPosition
    {
        return this.curFocus;
    }

    public getSelectionDisplayRectangle(): RectangleBounds
    {
        return new RectangleBounds(
                this.calcTopLeftIncl(),
                this.calcBottomRightIncl()
        );
    }

    public calcBottomRightIncl(): CellPosition
    {
        return new CellPosition(
            Utility.maxRow(this.startAnchor.rowIndex, this.curFocus.rowIndex),
            Utility.maxCol(this.startAnchor.columnIndex, this.curFocus.columnIndex)
        );
    }

    public calcTopLeftIncl(): CellPosition
    {
        return new CellPosition(
            Utility.minRow(this.startAnchor.rowIndex, this.curFocus.rowIndex),
            Utility.minCol(this.startAnchor.columnIndex, this.curFocus.columnIndex)
        );
    }

    public isExactly(cellPosition: CellPosition): boolean
    {
        return this.startAnchor.equals(cellPosition) && this.curFocus.equals(cellPosition);
    }

    public includes(tableDisplay: GridArea): boolean
    {
        // Rely on non-overlap of grid areas, and the way that our selection won't span multiple tables:
        return tableDisplay.contains(this.startAnchor);
    }

    public gotoRow(parent: unknown): void
    {
        this.tableSelectionLimits.gotoRow(parent, this.curFocus.columnIndex);
    }

    public notifySelected(_selected: boolean, _animateFlash: boolean): void
    {
    }

    public toString(): string
    {
        // For debugging:
        return "RectTableCellSel[" + this.startAnchor.toString() + "->" + this.curFocus.toString() + "]";
    }
}

export namespace RectangularTableCellSelection
{
    export interface TableSelectionLimits
    {
        getTopLeftIncl(): CellPosition;
        getBottomRightIncl(): CellPosition;

        doCopy(topLeftIncl: CellPosition, bottomRightIncl: CellPosition): void;

        doDelete(topLeftIncl: CellPosition, bottomRightIncl: CellPosition): void;

        // Java: gotoRow(Window parent, column); the parent is the GUI's
        gotoRow(parent: unknown, column: AbsColIndex): void;
    }
}
