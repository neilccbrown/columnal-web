// Port of xyz.columnal.rinterop.DefaultRVisitor (r-interop module).
import type { TemporalAccessor } from "../../java/time/TemporalAccessor.js";
import type { DateTimeInfo } from "../../types/data/datatype/DateTimeInfo.js";
import type { RValue } from "./RValue.js";
import type { RVisitor } from "./RVisitor.js";

/**
 * Implements RVisitor to return a default value from all methods.  You can then override individual methods if you wish
 */
export abstract class DefaultRVisitor<T> implements RVisitor<T>
{
    private readonly def: T;

    public constructor(def: T)
    {
        this.def = def;
    }

    public visitString(_s: string | null, _isSymbol: boolean): T
    {
        return this.def;
    }

    public visitLogicalList(_values: readonly boolean[], _isNA: readonly boolean[] | null, _attributes: RValue | null): T
    {
        return this.def;
    }

    public visitIntList(_values: readonly number[], _attributes: RValue | null): T
    {
        return this.def;
    }

    public visitDoubleList(_values: readonly number[], _attributes: RValue | null): T
    {
        return this.def;
    }

    public visitGenericList(_values: readonly RValue[], _attributes: RValue | null, _isObject: boolean): T
    {
        return this.def;
    }

    public visitStringList(_values: readonly (string | null)[], _attributes: RValue | null): T
    {
        return this.def;
    }

    public visitTemporalList(_dateTimeType: DateTimeInfo.DateTimeType, _values: readonly (TemporalAccessor | null)[], _attributes: RValue | null): T
    {
        return this.def;
    }

    public visitPairList(_items: readonly RVisitor.PairListEntry[]): T
    {
        return this.def;
    }

    public visitFactorList(_values: readonly number[], _levelNames: readonly string[]): T
    {
        return this.def;
    }

    public visitNil(): T
    {
        return this.def;
    }
}
