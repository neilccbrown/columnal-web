// Port of xyz.columnal.transformations.expression.explanation.ExplanationLocation (expressions module).
import type { TableDataRowIndex } from "../../../../anns/Annotations.js";
import { javaEquals, javaObjectsHash } from "../../../../java/JavaObject.js";
import type { ColumnId } from "../../../../identifiers/id/ColumnId.js";
import type { TableId } from "../../../../identifiers/id/TableId.js";

/**
 * A location can be:
 *  - A whole table (only tableId is present)
 *  - A whole column (tableId and columnId is present)
 *  - A specific location (tableId, columnId and rowIndex are present)
 */
export class ExplanationLocation
{
    public readonly tableId: TableId;
    public readonly columnId: ColumnId | null;
    public readonly rowIndex: TableDataRowIndex | null;

    // Java: ExplanationLocation(TableId), (TableId, ColumnId) and (TableId, @Nullable ColumnId, @Nullable Integer)
    public constructor(tableId: TableId, columnId: ColumnId | null = null, rowIndex: TableDataRowIndex | null = null)
    {
        this.tableId = tableId;
        this.columnId = columnId;
        this.rowIndex = rowIndex;
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof ExplanationLocation) || o.constructor !== this.constructor) return false;
        return this.rowIndex === o.rowIndex &&
                javaEquals(this.tableId, o.tableId) &&
                javaEquals(this.columnId, o.columnId);
    }

    public hashCode(): number
    {
        return javaObjectsHash(this.tableId, this.columnId, this.rowIndex);
    }

    public toString(): string
    {
        return this.tableId.toString() + (this.columnId !== null ? ("\\" + this.columnId.toString() + (this.rowIndex !== null ? ":" + this.rowIndex : "")) : "null");
    }
}
