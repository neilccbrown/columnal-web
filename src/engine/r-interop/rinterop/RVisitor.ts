// Port of xyz.columnal.rinterop.RVisitor (r-interop module).
// PORT-NOTE: Java's int[] and double[] are number arrays, and Optional values are T | null.
import type { DateTimeInfo } from "../../types/data/datatype/DateTimeInfo.js";
import type { TemporalAccessor } from "../../java/time/TemporalAccessor.js";
import type { RValue } from "./RValue.js";

/**
 * A visitor which effectively reveals the structure of RValue.
 */
export interface RVisitor<T>
{
    visitString(s: string | null, isSymbol: boolean): T;
    // If attributes reveal this is a factor, it won't be called; visitFactorList will be instead
    visitIntList(values: readonly number[], attributes: RValue | null): T;
    visitDoubleList(values: readonly number[], attributes: RValue | null): T;
    visitLogicalList(values: readonly boolean[], isNA: readonly boolean[] | null, attributes: RValue | null): T;
    visitStringList(values: readonly (string | null)[], attributes: RValue | null): T;
    visitTemporalList(dateTimeType: DateTimeInfo.DateTimeType, values: readonly (TemporalAccessor | null)[], attributes: RValue | null): T;
    visitGenericList(values: readonly RValue[], attributes: RValue | null, isObject: boolean): T;
    visitPairList(items: readonly RVisitor.PairListEntry[]): T;
    visitFactorList(values: readonly number[], levelNames: readonly string[]): T;
    visitNil(): T;
}

export namespace RVisitor
{
    export class PairListEntry
    {
        public readonly attributes: RValue | null;
        public readonly tag: RValue | null;
        public readonly item: RValue;

        public constructor(attributes: RValue | null, tag: RValue | null, item: RValue)
        {
            this.attributes = attributes;
            this.tag = tag;
            this.item = item;
        }
    }
}
