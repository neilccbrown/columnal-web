// Port of xyz.columnal.rinterop.SpecificRVisitor (r-interop module).
import type { TemporalAccessor } from "../../java/time/TemporalAccessor.js";
import type { DateTimeInfo } from "../../types/data/datatype/DateTimeInfo.js";
import { UserException } from "../../utility-error/error/UserException.js";
import type { RValue } from "./RValue.js";
import type { RVisitor } from "./RVisitor.js";

/**
 * Implements RVisitor to throw an error from each method.  You can then override individual methods.
 */
export abstract class SpecificRVisitor<T> implements RVisitor<T>
{
    public visitString(_s: string | null, _isSymbol: boolean): T
    {
        throw new UserException("Unexpected type: string");
    }

    public visitIntList(_values: readonly number[], _attributes: RValue | null): T
    {
        throw new UserException("Unexpected type: list of integer");
    }

    public visitDoubleList(_values: readonly number[], _attributes: RValue | null): T
    {
        throw new UserException("Unexpected type: list of floating point");
    }

    public visitLogicalList(_values: readonly boolean[], _isNA: readonly boolean[] | null, _attributes: RValue | null): T
    {
        throw new UserException("Unexpected type: list of booleans");
    }

    public visitTemporalList(_dateTimeType: DateTimeInfo.DateTimeType, _values: readonly (TemporalAccessor | null)[], _attributes: RValue | null): T
    {
        throw new UserException("Unexpected type: list of date/time type");
    }

    public visitStringList(_values: readonly (string | null)[], _attributes: RValue | null): T
    {
        throw new UserException("Unexpected type: list of strings");
    }

    public visitGenericList(_values: readonly RValue[], _attributes: RValue | null, _isObject: boolean): T
    {
        throw new UserException("Unexpected type: generic list");
    }

    public visitPairList(_items: readonly RVisitor.PairListEntry[]): T
    {
        throw new UserException("Unexpected type: pair list");
    }

    public visitFactorList(_values: readonly number[], _levelNames: readonly string[]): T
    {
        throw new UserException("Unexpected factor list");
    }

    public visitNil(): T
    {
        throw new UserException("Unexpected nil");
    }
}
