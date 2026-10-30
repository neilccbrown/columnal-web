// Java's EnterStructuredValueTrait (tests-gui-base): the text typed into a cell for a value.  Used by
// the cell entry logic tests and the grid's cell tests.
import type { ExpressionIdentifier } from "../../../../src/engine/anns/Annotations.js";
import { toPlainString, type Decimal } from "../../../../src/engine/java/JavaBigDecimal.js";
import type { JavaRandom } from "../../../../src/engine/java/JavaRandom.js";
import { ChronoField, ZonedDateTime } from "../../../../src/engine/java/time/JavaTime.js";
import type { TemporalAccessor } from "../../../../src/engine/java/time/TemporalAccessor.js";
import { GrammarUtility } from "../../../../src/engine/parsers/grammar/GrammarUtility.js";
import type { DataType, TagType } from "../../../../src/engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { DateTimeInfo } from "../../../../src/engine/types/data/datatype/DateTimeInfo.js";
import type { NumberInfo } from "../../../../src/engine/types/data/datatype/NumberInfo.js";
import type { TypeId } from "../../../../src/engine/types/data/datatype/TypeId.js";
import type { Unit } from "../../../../src/engine/types/data/unit/Unit.js";
import type { Either } from "../../../../src/engine/utility-adt/utility/adt/Either.js";
import type { ListEx, Record } from "../../../../src/engine/utility/utility/Utility.js";
import type { Value } from "../../../../src/engine/utility/utility/Value.js";

// Java's String.format("%02d", n) etc.
const pad = (n: number, width: number): string => String(n).padStart(width, "0");

/**
 * The text that EnterStructuredValueTrait.enterStructuredValue types into a cell for the value,
 * with the same choices (from r), except that it never pastes.  Records are typed with their
 * fields in order (allowFieldShuffle is false).
 */
export function textToType(dataType: DataType, value: Value, r: JavaRandom, topLevel: boolean): string
{
    return dataType.apply<string>({
        number(_numberInfo: NumberInfo): string
        {
            return toPlainString(value as Decimal);
        },
        text(): string
        {
            const stringValue = value as string;
            if (topLevel && stringValue !== "" && !stringValue.startsWith("\"") && !stringValue.endsWith("\"") && r.nextBoolean())
                return GrammarUtility.escapeChars(stringValue);
            else
                return "\"" + GrammarUtility.escapeChars(stringValue) + "\"";
        },
        date(dateTimeInfo: DateTimeInfo): string
        {
            const t = value as TemporalAccessor;
            const type = dateTimeInfo.getType();
            let s = "";
            if (DateTimeInfo.DateTimeType.hasYearMonth(type))
            {
                s += pad(t.get(ChronoField.YEAR), 4) + "-" + pad(t.get(ChronoField.MONTH_OF_YEAR), 2);
                if (DateTimeInfo.DateTimeType.hasDay(type))
                    s += "-" + pad(t.get(ChronoField.DAY_OF_MONTH), 2);
                if (DateTimeInfo.DateTimeType.hasTime(type))
                    s += " ";
            }
            if (DateTimeInfo.DateTimeType.hasTime(type))
            {
                const width = r.nextBoolean() ? 2 : 1;
                let after: string | null = null;
                if (r.nextBoolean())
                    s += pad(t.get(ChronoField.HOUR_OF_DAY), width) + ":";
                else
                {
                    s += pad(t.get(ChronoField.CLOCK_HOUR_OF_AMPM), width) + ":";
                    after = (r.nextBoolean() ? "" : "  ") + (t.get(ChronoField.AMPM_OF_DAY) === 0 ? "AM" : "PM");
                }
                s += pad(t.get(ChronoField.MINUTE_OF_HOUR), 2);
                const nano = t.get(ChronoField.NANO_OF_SECOND);
                const second = t.get(ChronoField.SECOND_OF_MINUTE);
                if (nano !== 0 || second !== 0 || r.nextInt(3) === 1)
                    s += ":" + pad(second, 2) + (nano === 0 ? "" : ".") + pad(nano, 9).replace(/0*$/, "");
                if (after !== null)
                    s += after;
            }
            if (DateTimeInfo.DateTimeType.hasZoneId(type))
                s += " " + (t as ZonedDateTime).zone().id();
            return s;
        },
        bool(): string
        {
            return String(value as boolean);
        },
        tagged(_typeName: TypeId, _typeVars: readonly Either<Unit, DataType>[], _tags: readonly TagType<DataType>[]): string
        {
            return DataTypeUtility.valueToString(value);
        },
        record(fields: ReadonlyMap<ExpressionIdentifier, DataType>): string
        {
            const record = value as Record;
            let s = "(";
            let first = true;
            for (const [name, type] of [...fields.entries()].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
            {
                if (!first)
                    s += "," + (r.nextBoolean() ? " " : "");
                first = false;
                s += name + ": " + textToType(type, record.getField(name), r, false);
            }
            return s + ")";
        },
        array(inner: DataType): string
        {
            const listEx = value as ListEx;
            let s = "[";
            for (let i = 0; i < listEx.size(); i++)
            {
                if (i > 0)
                    s += "," + (r.nextBoolean() ? " " : "");
                s += textToType(inner, listEx.get(i), r, false);
            }
            return s + "]";
        },
    });
}

