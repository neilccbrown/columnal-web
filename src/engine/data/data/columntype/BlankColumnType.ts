// Port of xyz.columnal.data.columntype.BlankColumnType (data module).
// Import it through ColumnTypes.ts (see ColumnType.ts).
import { ColumnType } from "./ColumnTypes.js";

/**
 * Created by neil on 30/10/2016.
 */
export class BlankColumnType extends ColumnType
{
    public static readonly INSTANCE = new BlankColumnType();

    // Singleton:
    private constructor()
    {
        super();
    }

    public override hashCode(): number
    {
        return 0;
    }

    public override equals(obj: unknown): boolean
    {
        return obj === BlankColumnType.INSTANCE;
    }

    public override toString(): string
    {
        return "Blank";
    }
}
