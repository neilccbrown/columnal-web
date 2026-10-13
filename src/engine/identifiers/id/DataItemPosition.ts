// Port of xyz.columnal.id.DataItemPosition (identifiers module).
import type { TableDataColIndex, TableDataRowIndex } from "../../anns/Annotations.js";

/**
 * A cell position is a location in the overall grid, independent
 * of any individual table bounds.
 */
export class DataItemPosition
{
    // Both are zero-based:
    public readonly rowIndex: TableDataRowIndex;
    public readonly columnIndex: TableDataColIndex;

    public constructor(rowIndex: TableDataRowIndex, columnIndex: TableDataColIndex)
    {
        this.rowIndex = rowIndex;
        this.columnIndex = columnIndex;
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof DataItemPosition) || o.constructor !== this.constructor) return false;
        if (this.rowIndex !== o.rowIndex) return false;
        return this.columnIndex === o.columnIndex;
    }

    public hashCode(): number
    {
        let result = this.rowIndex | 0;
        result = (Math.imul(31, result) + this.columnIndex) | 0;
        return result;
    }

    public toString(): string
    {
        return "(" + this.columnIndex + ", " + this.rowIndex + ")";
    }

    public static row(row: number): TableDataRowIndex
    {
        return row;
    }

    public static col(col: number): TableDataColIndex
    {
        return col;
    }
}
