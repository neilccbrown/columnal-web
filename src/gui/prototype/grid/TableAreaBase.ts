// Grid prototype (Phase 7, throwaway): what ProtoTableDisplay and WorkerTableDisplay share as tables
// on the grid (Java: DataDisplay's size and selection).  The rows are the table name, the column
// names, the column types, then the data.
import type { GridAreaRowIndex } from "../../../engine/anns/Annotations.js";
import type { CellPosition } from "../../../engine/data/data/CellPosition.js";
import { Either } from "../../../engine/utility-adt/utility/adt/Either.js";
import type { CellSelection } from "../../../gui-logic/stf/gui/grid/CellSelection.js";
import { GridArea } from "../../../gui-logic/stf/gui/grid/GridArea.js";
import { RectangleBounds } from "../../../gui-logic/stf/gui/grid/RectangleBounds.js";
import { RectangularTableCellSelection } from "../../../gui-logic/stf/gui/grid/RectangularTableCellSelection.js";
import { EntireTableSelection } from "../../../gui-logic/table-gui/gui/table/EntireTableSelection.js";
import { VersionCounter } from "../../store/EngineStore.js";

export abstract class TableAreaBase extends GridArea
{
    public static readonly HEADER_ROWS = 3;

    public abstract readonly columnNames: readonly string[];
    public currentKnownRows = 0;
    // Bumped when the table's data changes:
    public readonly dataVersion = new VersionCounter();
    // Bumped when the table's size changes:
    public readonly sizeVersion = new VersionCounter();

    private readonly dataSelectionLimits: RectangularTableCellSelection.TableSelectionLimits = {
        getTopLeftIncl: () => this.getPosition().offsetByRowCols(TableAreaBase.HEADER_ROWS, 0),
        getBottomRightIncl: () => this.getPosition().offsetByRowCols(TableAreaBase.HEADER_ROWS + Math.max(0, this.currentKnownRows - 1), Math.max(0, this.columnNames.length - 1)),
        doCopy: () => {},
        doDelete: () => {},
        gotoRow: () => {},
    };

    protected abstract override updateKnownRows(checkUpToRowInclGrid: GridAreaRowIndex, updateSizeAndPositions: () => void): void;

    protected override recalculateBottomRightIncl(): CellPosition
    {
        return this.getPosition().offsetByRowCols(Math.max(0, this.currentKnownRows + (this.columnNames.length === 0 ? 0 : TableAreaBase.HEADER_ROWS) - 1), Math.max(0, this.columnNames.length - 1));
    }

    public override getSelectionForSingleCell(cellPosition: CellPosition): CellSelection | null
    {
        if (!this.contains(cellPosition))
            return null;
        const us = this.getPosition();
        if (cellPosition.rowIndex === us.rowIndex)
        {
            return new EntireTableSelection({
                getPosition: () => this.getPosition(),
                getBottomRightIncl: () => this.getBottomRightIncl(),
                doCopy: () => {},
                doDelete: () => {},
                gotoRow: () => {},
                flashHeader: () => {},
            }, cellPosition.columnIndex);
        }
        else if (cellPosition.rowIndex >= us.rowIndex + TableAreaBase.HEADER_ROWS && cellPosition.rowIndex < us.rowIndex + this.currentKnownRows + TableAreaBase.HEADER_ROWS && cellPosition.columnIndex < us.columnIndex + this.columnNames.length)
        {
            return new RectangularTableCellSelection(cellPosition.rowIndex, cellPosition.columnIndex, this.dataSelectionLimits);
        }
        return new SingleCellSelection(cellPosition);
    }

    /** The data row shown at the given row of the grid, or null if it is not a data row. */
    public dataRowAt(absRow: number): number | null
    {
        const row = absRow - this.getPosition().rowIndex - TableAreaBase.HEADER_ROWS;
        return row >= 0 && row < this.currentKnownRows ? row : null;
    }
}

// Java: DataDisplay.SingleCellSelection, for a column name or type
class SingleCellSelection implements CellSelection
{
    private readonly pos: CellPosition;

    public constructor(pos: CellPosition)
    {
        this.pos = pos;
    }

    public atHome(): CellSelection { return this; }
    public atEnd(): CellSelection { return this; }
    public move(extendSelection: boolean, byRows: number, byColumns: number): Either<CellPosition, CellSelection>
    {
        if (!extendSelection)
            return Either.left(this.pos.offsetByRowCols(byRows, byColumns));
        return Either.right(this);
    }
    public extendTo(): CellSelection | null { return null; }
    public positionToEnsureInView(): CellPosition { return this.pos; }
    public getSelectionDisplayRectangle(): RectangleBounds { return new RectangleBounds(this.pos, this.pos); }
    public isExactly(cellPosition: CellPosition): boolean { return this.pos.equals(cellPosition); }
    public includes(): boolean { return false; }
    public gotoRow(): void {}
    public doCopy(): void {}
    public doPaste(): void {}
    public doDelete(): void {}
    public getActivateTarget(): CellPosition { return this.pos; }
    public notifySelected(): void {}
}
