// Java: EditSortDialog.SortPane.DirectionButton.setType: the smallest and largest example values its
// direction button shows (top to bottom for ascending, bottom to top for descending), for the type of
// the column being sorted by (as text, if not known).
import type { ExpressionIdentifier } from "../../engine/anns/Annotations.js";
import { DataType, type DataTypeVisitor, type TagType } from "../../engine/types/data/datatype/DataType.js";
import { DateTimeInfo } from "../../engine/types/data/datatype/DateTimeInfo.js";
import { InternalException } from "../../engine/utility-error/error/InternalException.js";
import { UserException } from "../../engine/utility-error/error/UserException.js";
import { Log } from "../../engine/utility/log/Log.js";

export function sortExamples(type: DataType | null): { readonly small: string, readonly large: string }
{
    const items = { small: "A", large: "Z" };
    const visitor: DataTypeVisitor<void> = {
        number: () =>
        {
            items.small = "1";
            items.large = "99";
        },
        text: () =>
        {
            items.small = "A";
            items.large = "Z";
        },
        date: (dateTimeInfo: DateTimeInfo) =>
        {
            switch (dateTimeInfo.getType())
            {
                case DateTimeInfo.DateTimeType.YEARMONTHDAY:
                case DateTimeInfo.DateTimeType.YEARMONTH:
                case DateTimeInfo.DateTimeType.DATETIME:
                case DateTimeInfo.DateTimeType.DATETIMEZONED:
                    items.small = "1965";
                    items.large = "2016";
                    break;
                case DateTimeInfo.DateTimeType.TIMEOFDAY:
                    items.small = "00:00";
                    items.large = "11:21";
                    break;
            }
        },
        bool: () =>
        {
            items.small = "false";
            items.large = "true";
        },
        tagged: (_typeName, _typeVars, tags: readonly TagType<DataType>[]) =>
        {
            const inner = tags.length === 1 ? tags[0]!.getInner() : null;
            if (inner !== null)
            {
                // Recurse first:
                inner.apply(visitor);
                // Then wrap:
                items.small = tags[0]!.getName() + " (" + items.small + ")";
                items.large = tags[0]!.getName() + " (" + items.large + ")";
            }
            else
            {
                // Just show tag names:
                items.small = tags[0]!.getName() + " …";
                items.large = tags[tags.length - 1]!.getName() + " …";
            }
        },
        record: (fields: ReadonlyMap<ExpressionIdentifier, DataType>) =>
        {
            const first = [...fields.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)[0];
            if (first === undefined)
                throw new UserException("Empty record type");
            // Recurse first:
            first[1].apply(visitor);
            // Then wrap:
            items.small = "(" + first[0] + ": " + items.small + ", …)";
            items.large = "(" + first[0] + ": " + items.large + ", …)";
        },
        array: (inner: DataType | null) =>
        {
            if (inner === null)
            {
                items.small = "[]";
                items.large = "[]";
            }
            else
            {
                // Recurse first:
                inner.apply(visitor);
                // Then wrap:
                items.small = "[" + items.small + ", …]";
                items.large = "[" + items.large + ", …]";
            }
        },
    };
    try
    {
        (type ?? DataType.TEXT).apply(visitor);
    }
    catch (e)
    {
        if (!(e instanceof UserException || e instanceof InternalException))
            throw e;
        Log.log(e);
    }
    return items;
}
