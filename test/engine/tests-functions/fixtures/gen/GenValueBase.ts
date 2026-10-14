// Port of test.gen.GenValueBase (tests-functions testFixtures).
//
// PORT-DEFERRED: values of function types need ValueFunction (expressions module, Phase 4).
import type { ExpressionIdentifier } from "../../../../../src/engine/anns/Annotations.js";
import { Decimal, fitsLong } from "../../../../../src/engine/java/JavaBigDecimal.js";
import { YearMonth, ZonedDateTime, ZoneId } from "../../../../../src/engine/java/time/JavaTime.js";
import type { DataType, TagType } from "../../../../../src/engine/types/data/datatype/DataType.js";
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

            function: (_argTypes: readonly DataType[], _resultType: DataType): Value =>
            {
                // PORT-DEFERRED: Java makes simple predicates (ValueFunction) for functions returning Boolean.
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
