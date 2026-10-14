// Port of xyz.columnal.data.columntype.ColumnType (data module).
// Load this class (and its subclasses) through ColumnTypes.ts: BLANK is a BlankColumnType.
import { BlankColumnType } from "./ColumnTypes.js";

/**
 * Created by neil on 30/10/2016.
 */
export abstract class ColumnType
{
    // Java: a static final field (a getter here, as the subclass is defined after this class)
    public static get BLANK(): BlankColumnType
    {
        return BlankColumnType.INSTANCE;
    }

    public abstract hashCode(): number;

    public abstract equals(obj: unknown): boolean;

    public abstract toString(): string;
}
