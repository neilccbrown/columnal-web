// Port of xyz.columnal.importers.ImporterUtility (importers module).
import type { ColumnType } from "../../data/data/columntype/ColumnType.js";
import { BlankColumnType, BoolColumnType, CleanDateColumnType, NumericColumnType, OrBlankColumnType, TextColumnType } from "../../data/data/columntype/ColumnTypes.js";
import type { EditableColumn } from "../../data/data/EditableColumn.js";
import { EditableRecordSet } from "../../data/data/EditableRecordSet.js";
import { MemoryBooleanColumn } from "../../data/data/MemoryBooleanColumn.js";
import { MemoryNumericColumn } from "../../data/data/MemoryNumericColumn.js";
import { MemoryStringColumn } from "../../data/data/MemoryStringColumn.js";
import { MemoryTaggedColumn } from "../../data/data/MemoryTaggedColumn.js";
import { MemoryTemporalColumn } from "../../data/data/MemoryTemporalColumn.js";
import type { RecordSet } from "../../data/data/RecordSet.js";
import { javaTrim } from "../../java/JavaString.js";
import type { TemporalAccessor } from "../../java/time/TemporalAccessor.js";
import { DataType } from "../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../types/data/datatype/DataTypeUtility.js";
import { NumberInfo } from "../../types/data/datatype/NumberInfo.js";
import type { TypeManager } from "../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../types/data/unit/Unit.js";
import { Either } from "../../utility-adt/utility/adt/Either.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import type { SimulationFunction } from "../../utility-functional/utility/function/simulation/SimulationFunction.js";
import { TaggedValue } from "../../utility/utility/TaggedValue.js";
import { javaClassName, Utility } from "../../utility/utility/Utility.js";
import type { ColumnInfo } from "./ColumnInfo.js";

export class ImporterUtility
{
    /**
     * Pads each row with extra blanks so that all rows have the same length.
     * Removes any rows which contain only blanks.s
     * Modifies list (and inner lists) in-place.
     */
    public static rectangulariseAndRemoveBlankRows(vals: string[][]): void
    {
        const maxRowLength = vals.reduce((max, l) => Math.max(max, l.length), 0);
        for (let i = 0; i < vals.length;)
        {
            const row = vals[i]!;
            if (row.every(s => s === ""))
            {
                vals.splice(i, 1);
            }
            else
            {
                while (row.length < maxRowLength)
                    row.push("");
                i++;
            }
        }
    }

    public static makeEditableRecordSet(mgr: TypeManager, vals: readonly (readonly string[])[], columnTypes: readonly ColumnInfo[]): EditableRecordSet
    {
        const columns: SimulationFunction<RecordSet, EditableColumn>[] = [];
        for (let i = 0; i < columnTypes.length; i++)
        {
            const columnInfo = columnTypes[i]!;
            const iFinal = i;
            const slice = Utility.sliceSkipBlankRows(vals, 0, iFinal);
            const columnType: ColumnType = columnInfo.type;
            if (columnType instanceof NumericColumnType)
            {
                //TODO remove prefix
                // TODO treat maybe blank as a tagged type
                columns.push(rs =>
                {
                    const numericColumnType = columnType;
                    return new MemoryNumericColumn(rs, columnInfo.title, new NumberInfo(numericColumnType.unit), slice.map(s => numericColumnType.removePrefixAndSuffix(s)));
                });
            }
            else if (columnType instanceof TextColumnType || columnType instanceof BlankColumnType)
            {
                columns.push(rs => new MemoryStringColumn(rs, columnInfo.title, Utility.mapList(slice, x => Either.right<string, string>(x)), ""));
            }
            else if (columnType instanceof CleanDateColumnType)
            {
                columns.push(rs =>
                {
                    const dateTimeInfo = columnType.getDateTimeInfo();
                    return new MemoryTemporalColumn(rs, columnInfo.title, dateTimeInfo, Utility.mapListInt<string, Either<string, TemporalAccessor>>(slice, s => columnType.parse(s)), dateTimeInfo.getDefaultValue());
                });
            }
            else if (columnType instanceof BoolColumnType)
            {
                const bool = columnType;
                columns.push(rs => new MemoryBooleanColumn(rs, columnInfo.title, Utility.mapList(slice, s => bool.parse(s)), false));
            }
            else if (columnType instanceof OrBlankColumnType && columnType.getInner() instanceof NumericColumnType)
            {
                const or = columnType;
                const inner = or.getInner() as NumericColumnType;
                const numberType = DataType.number(new NumberInfo(inner.unit));
                const type: DataType = mgr.getMaybeType().instantiate(
                    [Either.right<Unit, DataType>(numberType)], mgr
                );
                const typeFinal = type;
                columns.push(rs => new MemoryTaggedColumn(rs, columnInfo.title, DataTypeUtility.getTaggedTypeName(typeFinal), [Either.right<Unit, DataType>(numberType)], DataTypeUtility.getTagTypes(typeFinal), Utility.mapListEx(slice, (item: string) =>
                {
                    if (item === "" || javaTrim(item) === or.getBlankString())
                        return Either.right<string, TaggedValue>(new TaggedValue(0, null, mgr.getMaybeType()));
                    else
                    {
                        const n = Utility.parseNumberOpt(inner.removePrefixAndSuffix(item));
                        return n !== null ? Either.right<string, TaggedValue>(new TaggedValue(1, n, mgr.getMaybeType())) : Either.left<string, TaggedValue>(item);
                    }
                }), new TaggedValue(0, null, mgr.getMaybeType())));
            }
            else
            {
                throw new InternalException("Unhandled column type: " + javaClassName(columnType));
            }
            // If it's blank, should we add any column?
            // Maybe if it has title?                }
        }
        const len = vals.length - vals.filter(r => r.every(s => s === "")).length;
        return new EditableRecordSet(columns, () => len);
    }
}
