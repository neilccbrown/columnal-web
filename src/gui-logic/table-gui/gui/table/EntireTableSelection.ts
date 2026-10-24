// Port of xyz.columnal.gui.table.EntireTableSelection (table-gui module).
//
// PORT-NOTE: Java selects a HeadedDisplay (the GUI class for a table with a header, rebuilt in the
// GUI); here it is anything with the parts of HeadedDisplay that the selection uses
// (EntireTableSelection.Selected).
import type { AbsColIndex } from "../../../../engine/anns/Annotations.js";
import type { CellPosition } from "../../../../engine/data/data/CellPosition.js";
import { Either } from "../../../../engine/utility-adt/utility/adt/Either.js";
import type { CellSelection } from "../../../stf/gui/grid/CellSelection.js";
import type { GridArea } from "../../../stf/gui/grid/GridArea.js";
import { RectangleBounds } from "../../../stf/gui/grid/RectangleBounds.js";

export class EntireTableSelection implements CellSelection
{
    private readonly selected: EntireTableSelection.Selected;
    // Although we select the whole table, if they move out up/down, we stay
    // in the column they entered from:
    private readonly column: AbsColIndex;

    public constructor(selected: EntireTableSelection.Selected, column: AbsColIndex)
    {
        this.selected = selected;
        this.column = column;
    }

    public doCopy(): void
    {
        this.selected.doCopy(null);
    }

    public doPaste(): void
    {
        // TODO
    }

    public doDelete(): void
    {
        this.selected.doDelete();
    }

    public getActivateTarget(): CellPosition
    {
        return this.selected.getPosition();
    }

    public atHome(_extendSelection: boolean): CellSelection
    {
        return this;
    }

    public atEnd(_extendSelection: boolean): CellSelection
    {
        return this;
    }

    public move(extendSelection: boolean, byRows: number, byColumns: number): Either<CellPosition, CellSelection>
    {
        if (!extendSelection)
        {
            if (byRows !== 0)
            {
                // Conceieve of this as going up/down first to a single cell, then across:
                return Either.left(this.selected.getPosition().offsetByRowCols(byRows, (this.column - this.selected.getPosition().columnIndex) + byColumns));
            }
            else
            {
                // Only going left/right, just move out of the end of the table:
                if (byColumns <= 0)
                    return Either.left(this.selected.getPosition().offsetByRowCols(byRows, byColumns));
                else
                    return Either.left(this.selected.getPosition().offsetByRowCols(byRows, byColumns + this.selected.getBottomRightIncl().columnIndex - this.selected.getPosition().columnIndex));
            }
        }
        return Either.right(this);
    }

    public positionToEnsureInView(): CellPosition
    {
        return this.selected.getPosition();
    }

    public getSelectionDisplayRectangle(): RectangleBounds
    {
        return new RectangleBounds(this.selected.getPosition(), this.selected.getBottomRightIncl());
    }

    public isExactly(_cellPosition: CellPosition): boolean
    {
        // Whole table, so won't be single cell:
        return false;
    }

    public includes(tableDisplay: GridArea): boolean
    {
        return (this.selected as unknown) === tableDisplay;
    }

    public gotoRow(parent: unknown): void
    {
        this.selected.gotoRow(parent, this.column);
    }

    public notifySelected(selected: boolean, animateFlash: boolean): void
    {
        if (selected && animateFlash)
            this.selected.flashHeader();
    }

    public extendTo(_cellPosition: CellPosition): CellSelection | null
    {
        return null;
    }

    // For debugging
    public toString(): string
    {
        return "EntireTableSelection[" + this.selected.getPosition().toString() + "-" + this.selected.getBottomRightIncl().toString() + "]";
    }
}

export namespace EntireTableSelection
{
    /** The parts of Java's HeadedDisplay that the selection uses. */
    export interface Selected
    {
        getPosition(): CellPosition;
        getBottomRightIncl(): CellPosition;
        // Java: doCopy(@Nullable RectangleBounds), which copies the whole table for null
        doCopy(bounds: RectangleBounds | null): void;
        doDelete(): void;
        // Java: gotoRow(Window parent, column); the parent is the GUI's
        gotoRow(parent: unknown, column: AbsColIndex): void;
        flashHeader(): void;
    }
}
