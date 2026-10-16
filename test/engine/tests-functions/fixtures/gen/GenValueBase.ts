// Port of test.gen.GenValueBase (tests-functions testFixtures).
import type { ExpressionIdentifier } from "../../../../../src/engine/anns/Annotations.js";
import { ValueFunction } from "../../../../../src/engine/expressions/transformations/expression/function/ValueFunction.js";
import { Decimal, doubleValue, fitsLong, longValue } from "../../../../../src/engine/java/JavaBigDecimal.js";
import { YearMonth, ZonedDateTime, ZoneId } from "../../../../../src/engine/java/time/JavaTime.js";
import { DataType, ValueClass, type DataTypeVisitor, type TagType } from "../../../../../src/engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { DateTimeInfo } from "../../../../../src/engine/types/data/datatype/DateTimeInfo.js";
import type { NumberInfo } from "../../../../../src/engine/types/data/datatype/NumberInfo.js";
import type { TypeId } from "../../../../../src/engine/types/data/datatype/TypeId.js";
import type { Unit } from "../../../../../src/engine/types/data/unit/Unit.js";
import type { Either } from "../../../../../src/engine/utility-adt/utility/adt/Either.js";
import { InternalException } from "../../../../../src/engine/utility-error/error/InternalException.js";
import { TaggedValue } from "../../../../../src/engine/utility/utility/TaggedValue.js";
import { RecordMap, Utility } from "../../../../../src/engine/utility/utility/Utility.js";
import type { Value } from "../../../../../src/engine/utility/utility/Value.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../support/quickcheck.js";
import { TBasicUtil } from "../../../tests-basic/fixtures/data/TBasicUtil.js";
import { GenZoneId } from "../../../tests-basic/fixtures/gen/GenZoneId.js";

/**
 * Created by neil on 22/01/2017.
 */
export abstract class GenValueBase<T> extends Generator<T>
{
    // Easier than passing parameters around:
    protected r!: SourceOfRandomness;
    protected gs!: GenerationStatus;
    protected numberOnlyInt = false;

    protected makeValue(t: DataType): Value
    {
        const r = this.r;
        const gs = this.gs;
        return t.apply<Value>({
            number: (_displayInfo: NumberInfo): Value =>
            {
                if (this.numberOnlyInt)
                    return this.genInt();
                else
                    return TBasicUtil.generateNumberV(r, gs);
            },

            text: (): Value =>
            {
                return TBasicUtil.makeStringV(r, gs);
            },

            date: (dateTimeInfo: DateTimeInfo): Value =>
            {
                switch (dateTimeInfo.getType())
                {
                    case DateTimeInfo.DateTimeType.YEARMONTHDAY:
                        return TBasicUtil.generateDate(r, gs);
                    case DateTimeInfo.DateTimeType.YEARMONTH:
                        return YearMonth.of(r.nextInt(1, 9999), r.nextInt(1, 12));
                    case DateTimeInfo.DateTimeType.TIMEOFDAY:
                        return TBasicUtil.generateTime(r, gs);
                    //case TIMEOFDAYZONED:
                        //return OffsetTime.of(TestUtil.generateTime(r, gs), ZoneOffset.ofTotalSeconds(60 * r.nextInt(-18*60, 18*60)));
                    case DateTimeInfo.DateTimeType.DATETIME:
                        return TBasicUtil.generateDateTime(r, gs);
                    case DateTimeInfo.DateTimeType.DATETIMEZONED:
                        // Can be geographical or pure offset:
                        return ZonedDateTime.of(TBasicUtil.generateDateTime(r, gs),
                            r.nextBoolean() ?
                                new GenZoneId().generate(r, gs) :
                                ZoneId.ofOffset("", TBasicUtil.generateZoneOffset(r, gs))
                        );
                    default:
                        throw new InternalException("Unknown date type: " + String(dateTimeInfo.getType()));
                }
            },

            bool: (): Value =>
            {
                return DataTypeUtility.value(r.nextBoolean());
            },

            tagged: (_typeName: TypeId, _typeVars: readonly Either<Unit, DataType>[], tags: readonly TagType<DataType>[]): Value =>
            {
                const tagIndex = r.nextInt(0, tags.length - 1);
                let o: Value | null;
                const inner = tags[tagIndex]!.getInner();
                if (inner !== null)
                    o = this.makeValue(inner);
                else
                    o = null;
                return new TaggedValue(tagIndex, o, DataTypeUtility.fromTags(tags));
            },

            record: (fields: ReadonlyMap<ExpressionIdentifier, DataType>): Value =>
            {
                return DataTypeUtility.value(new RecordMap(Utility.mapValuesEx(fields, t => this.makeValue(t))));
            },

            array: (inner: DataType | null): Value =>
            {
                if (inner === null)
                    return DataTypeUtility.value([]);
                const innerFinal = inner;
                return DataTypeUtility.value(TBasicUtil.makeList(r, 1, 4, () => this.makeValue(innerFinal)));
            },

            function: (argTypes: readonly DataType[], resultType: DataType): Value =>
            {
                if (resultType.equals(DataType.BOOLEAN) && argTypes.length === 1)
                {
                    const f = <V extends Value>(type: ValueClass<V>, predicate: (v: V) => boolean): ValueFunction =>
                    {
                        return new class extends ValueFunction
                        {
                            public override _call(): Value
                            {
                                return DataTypeUtility.value(predicate(this.arg(0, type)));
                            }
                        }();
                    };
                    const visitor: DataTypeVisitor<ValueFunction> = {
                        number: (_numberInfo: NumberInfo): ValueFunction =>
                        {
                            return r.choose([
                                f(ValueClass.NUMBER, n => doubleValue(n) > 0),
                                f(ValueClass.NUMBER, n => longValue(n) <= 0n),
                                f(ValueClass.NUMBER, n => Utility.isIntegral(n)),
                            ]);
                        },

                        text: (): ValueFunction =>
                        {
                            return r.choose([
                                f(ValueClass.STRING, s => s.length === 0),
                                f(ValueClass.STRING, s => s.includes("a")),
                            ]);
                        },

                        date: (_dateTimeInfo: DateTimeInfo): ValueFunction =>
                        {
                            return f(ValueClass.TEMPORAL, _t => true);
                        },

                        bool: (): ValueFunction =>
                        {
                            return r.choose([
                                f(ValueClass.BOOLEAN, b => b),
                                f(ValueClass.BOOLEAN, b => !b),
                            ]);
                        },

                        tagged: (_typeName: TypeId, _typeVars: readonly Either<Unit, DataType>[], _tags: readonly TagType<DataType>[]): ValueFunction =>
                        {
                            return f(ValueClass.TAGGED, t => t.getTagIndex() === 0);
                        },

                        record: (fields: ReadonlyMap<ExpressionIdentifier, DataType>): ValueFunction =>
                        {
                            const entry = [...fields][0]!;
                            // Choose once outside function invocation:
                            const innerFunc = entry[1].apply(visitor);
                            return f(ValueClass.RECORD, o => Utility.cast(innerFunc.call([o.getField(entry[0])]), Boolean));
                        },

                        array: (_inner: DataType): ValueFunction =>
                        {
                            return f(ValueClass.LIST, l => l.size() === 0);
                        },
                    };
                    return ValueFunction.value(argTypes[0]!.apply(visitor));
                }
                throw new InternalException("We only support functions with Boolean return type for testing");
            },
        });
    }

    /**
     * PORT-NOTE: Java generates numbers until one is not a BigDecimal (i.e. a Long, Integer, Short or
     * Byte).  With canonical numbers, this takes the first whole number that fits in a long.
     */
    protected genInt(): Decimal
    {
        let n: Decimal;
        do
        {
            n = TBasicUtil.generateNumberV(this.r, this.gs);
        }
        while (!(n.isInteger() && fitsLong(n)));
        return DataTypeUtility.value(new Decimal(n));
    }
}
