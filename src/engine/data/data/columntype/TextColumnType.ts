// Port of xyz.columnal.data.columntype.TextColumnType (data module).
// Import it through ColumnTypes.ts (see ColumnType.ts).
import { ColumnType } from "./ColumnTypes.js";

/**
 * Created by neil on 30/10/2016.
 */
export class TextColumnType extends ColumnType
{
    public override hashCode(): number
    {
        return 0;
    }

    public override equals(obj: unknown): boolean
    {
        return obj !== null && obj instanceof TextColumnType;
    }

    public override toString(): string
    {
        return "Text";
    }
}
