// Port of xyz.columnal.data.columntype.OrBlankColumnType (data module).
// Import it through ColumnTypes.ts (see ColumnType.ts).
import { TypeManager } from "../../../types/data/datatype/TypeManager.js";
import { ColumnType } from "./ColumnTypes.js";

/**
 * A column type which also has the option to be blank.
 */
export class OrBlankColumnType extends ColumnType
{
    // The actual column type (when non-blank)
    private readonly columnType: ColumnType;
    private readonly blankString: string;

    public constructor(columnType: ColumnType, blankString: string)
    {
        super();
        this.columnType = columnType;
        this.blankString = blankString;
    }

    public getInner(): ColumnType
    {
        return this.columnType;
    }

    public override hashCode(): number
    {
        return (1 + this.columnType.hashCode()) | 0;
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof OrBlankColumnType)) return false;

        const that = o;

        return this.columnType.equals(that.columnType);
    }

    public override toString(): string
    {
        return TypeManager.MAYBE_NAME + " (" + this.columnType.toString() + ")";
    }

    public getBlankString(): string
    {
        return this.blankString;
    }
}
