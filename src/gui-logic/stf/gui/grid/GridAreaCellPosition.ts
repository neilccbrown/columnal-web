// Port of xyz.columnal.gui.grid.GridAreaCellPosition (stf module).
import type { GridAreaColIndex, GridAreaRowIndex } from "../../../../engine/anns/Annotations.js";
import { CellPosition } from "../../../../engine/data/data/CellPosition.js";

/**
 * A grid area cell position is a location in a particular subgrid (e.g. table)
 */
/* package-visible */
export class GridAreaCellPosition
{
    // Both are zero-based:
    public readonly rowIndex: GridAreaRowIndex;
    public readonly columnIndex: GridAreaColIndex;

    public constructor(rowIndex: GridAreaRowIndex, columnIndex: GridAreaColIndex)
    {
        this.rowIndex = rowIndex;
        this.columnIndex = columnIndex;
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof GridAreaCellPosition)) return false;
        const that = o;
        if (this.rowIndex !== that.rowIndex) return false;
        return this.columnIndex === that.columnIndex;
    }

    public hashCode(): number
    {
        let result = this.rowIndex;
        result = (Math.imul(31, result) + this.columnIndex) | 0;
        return result;
    }

    public toString(): string
    {
        return "(" + this.columnIndex + ", " + this.rowIndex + ")";
    }

    public static relativeFrom(position: CellPosition, topLeft: CellPosition): GridAreaCellPosition
    {
        return new GridAreaCellPosition(position.rowIndex - topLeft.rowIndex, position.columnIndex - topLeft.columnIndex);
    }

    /**
     * Given a top-left position for the grid area, returns the overall position once you apply
     * the offset given by this position.
     */
    public from(position: CellPosition): CellPosition
    {
        return position.offsetByRowCols(this.rowIndex, this.columnIndex);
    }
}
