// Port of xyz.columnal.data.CellPosition (data module).
import type { AbsColIndex, AbsRowIndex } from "../../anns/Annotations.js";

/**
 * A cell position is a location in the overall grid, independent
 * of any individual table bounds.
 */
export class CellPosition
{
    // Both are zero-based:
    public readonly rowIndex: AbsRowIndex;
    public readonly columnIndex: AbsColIndex;

    public constructor(rowIndex: AbsRowIndex, columnIndex: AbsColIndex)
    {
        this.rowIndex = rowIndex;
        this.columnIndex = columnIndex;
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof CellPosition)) return false;

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

    public offsetByRowCols(rows: number, cols: number): CellPosition
    {
        return new CellPosition((this.rowIndex + rows) | 0, (this.columnIndex + cols) | 0);
    }

    public static readonly ORIGIN = new CellPosition(CellPosition.row(0), CellPosition.col(0));

    public static row(row: number): AbsRowIndex
    {
        return row;
    }

    public static col(col: number): AbsColIndex
    {
        return col;
    }
}
