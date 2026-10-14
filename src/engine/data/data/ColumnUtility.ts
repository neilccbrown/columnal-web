// Port of xyz.columnal.data.ColumnUtility (data module).
import type { ColumnId } from "../../identifiers/id/ColumnId.js";
import type { Decimal } from "../../java/JavaBigDecimal.js";
import type { TemporalAccessor } from "../../java/time/TemporalAccessor.js";
import { DataType, ValueClass, type DataTypeVisitor, type DataTypeVisitorEx } from "../../types/data/datatype/DataType.js";
import type { DataTypeValue } from "../../types/data/datatype/DataTypeValue.js";
import type { DateTimeInfo } from "../../types/data/datatype/DateTimeInfo.js";
import type { NumberInfo } from "../../types/data/datatype/NumberInfo.js";
import type { Either } from "../../utility-adt/utility/adt/Either.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { UserException } from "../../utility-error/error/UserException.js";
import type { SimulationFunction } from "../../utility-functional/utility/function/simulation/SimulationFunction.js";
import type { TaggedValue } from "../../utility/utility/TaggedValue.js";
import { javaClassName, Utility, type ListEx, type Record } from "../../utility/utility/Utility.js";
import type { Value } from "../../utility/utility/Value.js";
import { ArrayColumnStorage } from "./ArrayColumnStorage.js";
import { BooleanColumnStorage } from "./BooleanColumnStorage.js";
import { CachedCalculatedColumn } from "./CachedCalculatedColumn.js";
import type { Column } from "./Column.js";
import { ColumnMaker } from "./ColumnMaker.js";
import type { ColumnStorage } from "./ColumnStorage.js";
import type { EditableColumn } from "./EditableColumn.js";
import { MemoryArrayColumn } from "./MemoryArrayColumn.js";
import { MemoryBooleanColumn } from "./MemoryBooleanColumn.js";
import { MemoryNumericColumn } from "./MemoryNumericColumn.js";
import { MemoryRecordColumn } from "./MemoryRecordColumn.js";
import { MemoryStringColumn } from "./MemoryStringColumn.js";
import { MemoryTaggedColumn } from "./MemoryTaggedColumn.js";
import { MemoryTemporalColumn } from "./MemoryTemporalColumn.js";
import { NumericColumnStorage } from "./NumericColumnStorage.js";
import type { RecordSet } from "./RecordSet.js";
import { RecordColumnStorage } from "./RecordColumnStorage.js";
import { StringColumnStorage } from "./StringColumnStorage.js";
import { TaggedColumnStorage } from "./TaggedColumnStorage.js";
import { TemporalColumnStorage } from "./TemporalColumnStorage.js";

export class ColumnUtility
{
    public static makeCalculatedColumn(dataType: DataType, rs: RecordSet, name: ColumnId, getItem: (index: number) => Value, addManualEdit: (original: DataTypeValue) => DataTypeValue): Column
    {
        const castTo = <T extends Value>(cls: ValueClass<T>, value: Value): T =>
        {
            if (!cls.is(value))
                throw new InternalException("Type inconsistency: should be " + cls.javaName + " but is " + javaClassName(value) + " for column: " + name.toString());
            return value;
        };
        const visitor: DataTypeVisitorEx<Column> = {
            number: (displayInfo: NumberInfo): Column =>
            {
                return new CachedCalculatedColumn<Decimal, NumericColumnStorage>(rs, name, (g: ColumnStorage.BeforeGet<NumericColumnStorage>) => new NumericColumnStorage(displayInfo, g, false), i =>
                {
                    return castTo(ValueClass.NUMBER, getItem(i));
                }, addManualEdit);
            },

            text: (): Column =>
            {
                return new CachedCalculatedColumn<string, StringColumnStorage>(rs, name, (g: ColumnStorage.BeforeGet<StringColumnStorage>) => new StringColumnStorage(g, false), i =>
                {
                    return castTo(ValueClass.STRING, getItem(i));
                }, addManualEdit);
            },

            date: (dateTimeInfo: DateTimeInfo): Column =>
            {
                return new CachedCalculatedColumn<TemporalAccessor, TemporalColumnStorage>(rs, name, (g: ColumnStorage.BeforeGet<TemporalColumnStorage>) => new TemporalColumnStorage(dateTimeInfo, g, false), i =>
                {
                    return castTo(ValueClass.TEMPORAL, getItem(i));
                }, addManualEdit);
            },

            bool: (): Column =>
            {
                return new CachedCalculatedColumn<boolean, BooleanColumnStorage>(rs, name, (g: ColumnStorage.BeforeGet<BooleanColumnStorage>) => new BooleanColumnStorage(g, false), i =>
                {
                    return castTo(ValueClass.BOOLEAN, getItem(i));
                }, addManualEdit);
            },

            tagged: (typeName, typeVars, tags): Column =>
            {
                return new CachedCalculatedColumn<TaggedValue, TaggedColumnStorage>(rs, name, (g: ColumnStorage.BeforeGet<TaggedColumnStorage>) => new TaggedColumnStorage(typeName, typeVars, tags, g, false), i =>
                {
                    return castTo(ValueClass.TAGGED, getItem(i));
                }, addManualEdit);
            },

            record: (fields): Column =>
            {
                return new CachedCalculatedColumn<Record, RecordColumnStorage>(rs, name, (g: ColumnStorage.BeforeGet<RecordColumnStorage>) => new RecordColumnStorage(fields, g as ColumnStorage.BeforeGet<never>, false), i =>
                {
                    return castTo(ValueClass.RECORD, getItem(i));
                }, addManualEdit);
            },

            array: (inner): Column =>
            {
                return new CachedCalculatedColumn<ListEx, ArrayColumnStorage>(rs, name, (g: ColumnStorage.BeforeGet<ArrayColumnStorage>) => new ArrayColumnStorage(inner, g, false), i =>
                {
                    return castTo(ValueClass.LIST, getItem(i));
                }, addManualEdit);
            },
        };
        return dataType.apply(visitor);
    }

    /**
     * Java has two overloads:
     *  - makeImmediateColumn(dataType, columnId, values, defaultValue), giving a function which makes the column
     *  - makeImmediateColumn(dataType, columnId, defaultValue), giving a ColumnMaker (to load the values)
     */
    public static makeImmediateColumn(dataType: DataType, columnId: ColumnId, value: readonly Either<string, Value>[], defaultValue: Value): SimulationFunction<RecordSet, EditableColumn>;
    public static makeImmediateColumn(dataType: DataType, columnId: ColumnId, defaultValue: Value): ColumnMaker<EditableColumn, Value>;
    public static makeImmediateColumn(dataType: DataType, columnId: ColumnId, c: readonly Either<string, Value>[] | Value, d?: Value): SimulationFunction<RecordSet, EditableColumn> | ColumnMaker<EditableColumn, Value>
    {
        if (d === undefined)
            return ColumnUtility.makeImmediateColumnMaker(dataType, columnId, c as Value);
        const value = c as readonly Either<string, Value>[];
        const defaultValue = d;
        const listValue = <T>(values: readonly Either<string, Value>[], applyValue: (v: Value) => T): Either<string, T>[] =>
        {
            return Utility.mapListInt(values, x => x.mapInt(applyValue));
        };
        const visitor: DataTypeVisitor<SimulationFunction<RecordSet, EditableColumn>> = {
            number: (displayInfo) =>
            {
                return rs => new MemoryNumericColumn(rs, columnId, displayInfo, listValue(value, Utility.valueNumber), ColumnUtility.castValue(defaultValue, ValueClass.NUMBER));
            },

            text: () =>
            {
                return rs => new MemoryStringColumn(rs, columnId, listValue(value, Utility.valueString), ColumnUtility.castValue(defaultValue, ValueClass.STRING));
            },

            date: (dateTimeInfo) =>
            {
                return rs => new MemoryTemporalColumn(rs, columnId, dateTimeInfo, listValue(value, Utility.valueTemporal), ColumnUtility.castValue(defaultValue, ValueClass.TEMPORAL));
            },

            bool: () =>
            {
                return rs => new MemoryBooleanColumn(rs, columnId, listValue(value, Utility.valueBoolean), ColumnUtility.castValue(defaultValue, ValueClass.BOOLEAN));
            },

            tagged: (typeName, typeVars, tags) =>
            {
                return rs => new MemoryTaggedColumn(rs, columnId, typeName, typeVars, tags, listValue(value, Utility.valueTagged), ColumnUtility.castValue(defaultValue, ValueClass.TAGGED));
            },

            record: (fields) =>
            {
                return rs => new MemoryRecordColumn(rs, columnId, fields, listValue(value, (t: Value) => Utility.valueRecord(t)), Utility.valueRecord(defaultValue));
            },

            array: (inner: DataType | null) =>
            {
                if (inner === null)
                    throw new UserException("Cannot create column with empty array type");
                const innerFinal = inner;
                return rs => new MemoryArrayColumn(rs, columnId, innerFinal, listValue(value, Utility.valueList), ColumnUtility.castValue(defaultValue, ValueClass.LIST));
            },
        };
        return dataType.apply(visitor);
    }

    // Java: makeImmediateColumn(DataType, ColumnId, Object defaultValue)
    private static makeImmediateColumnMaker(dataType: DataType, columnId: ColumnId, defaultValue: Value): ColumnMaker<EditableColumn, Value>
    {
        const visitor: DataTypeVisitor<ColumnMaker<EditableColumn, Value>> = {
            number: (displayInfo) =>
            {
                return new ColumnMaker<MemoryNumericColumn, Decimal>(defaultValue, ValueClass.NUMBER, (rs, defaultValue) => new MemoryNumericColumn(rs, columnId, displayInfo, [], defaultValue), (c, n) => c.add(n), p => DataType.loadNumber(p), p => DataType.loadNumber(p)) as unknown as ColumnMaker<EditableColumn, Value>;
            },

            text: () =>
            {
                return new ColumnMaker<MemoryStringColumn, string>(defaultValue, ValueClass.STRING, (rs, defaultValue) => new MemoryStringColumn(rs, columnId, [], defaultValue), (c, s) => c.add(s), p => DataType.loadString(p), p => DataType.loadString(p)) as unknown as ColumnMaker<EditableColumn, Value>;
            },

            date: (dateTimeInfo) =>
            {
                return new ColumnMaker<MemoryTemporalColumn, TemporalAccessor>(defaultValue, ValueClass.TEMPORAL, (rs, defaultValue) => new MemoryTemporalColumn(rs, columnId, dateTimeInfo, [], defaultValue), (c, t) => c.add(t), p => dateTimeInfo.parse(p), p => dateTimeInfo.parse(p)) as unknown as ColumnMaker<EditableColumn, Value>;
            },

            bool: () =>
            {
                return new ColumnMaker<MemoryBooleanColumn, boolean>(defaultValue, ValueClass.BOOLEAN, (rs, defaultValue) => new MemoryBooleanColumn(rs, columnId, [], defaultValue), (c, b) => c.add(b), p => DataType.loadBool(p), p => DataType.loadBool(p)) as unknown as ColumnMaker<EditableColumn, Value>;
            },

            tagged: (typeName, typeVars, tags) =>
            {
                return new ColumnMaker<MemoryTaggedColumn, TaggedValue>(defaultValue, ValueClass.TAGGED, (rs, defaultValue) => new MemoryTaggedColumn(rs, columnId, typeName, typeVars, tags, [], defaultValue), (c, t) => c.add(t), p => DataType.loadTaggedValue(tags, p), p => DataType.loadTaggedValue(tags, p)) as unknown as ColumnMaker<EditableColumn, Value>;
            },

            record: (fields) =>
            {
                return new ColumnMaker<MemoryRecordColumn, Record>(defaultValue, ValueClass.RECORD, (rs, defaultValue) => new MemoryRecordColumn(rs, columnId, fields, defaultValue), (c, t) => c.add(t), p => DataType.loadRecord(fields, p, false), p => DataType.loadRecord(fields, p, false)) as unknown as ColumnMaker<EditableColumn, Value>;
            },

            array: (inner: DataType | null) =>
            {
                if (inner === null)
                    throw new UserException("Cannot have column with type of empty array");

                const innerFinal = inner;
                return new ColumnMaker<MemoryArrayColumn, ListEx>(defaultValue, ValueClass.LIST, (rs, defaultValue) => new MemoryArrayColumn(rs, columnId, innerFinal, [], defaultValue), (c, v) => c.add(v), p => DataType.loadArray(innerFinal, p), p => DataType.loadArray(innerFinal, p)) as unknown as ColumnMaker<EditableColumn, Value>;
            },
        };
        return dataType.apply(visitor);
    }

    public static makeColumnStorage(inner: DataType, beforeGet: ColumnStorage.BeforeGet<never> | null, isImmediateData: boolean): ColumnStorage<Value>
    {
        const visitor: DataTypeVisitorEx<ColumnStorage<Value>> = {
            number: (displayInfo) =>
            {
                return new NumericColumnStorage(displayInfo, beforeGet as ColumnStorage.BeforeGet<NumericColumnStorage> | null, isImmediateData);
            },

            bool: () =>
            {
                return new BooleanColumnStorage(beforeGet as ColumnStorage.BeforeGet<BooleanColumnStorage> | null, isImmediateData);
            },

            text: () =>
            {
                return new StringColumnStorage(beforeGet as ColumnStorage.BeforeGet<StringColumnStorage> | null, isImmediateData);
            },

            date: (dateTimeInfo) =>
            {
                return new TemporalColumnStorage(dateTimeInfo, beforeGet as ColumnStorage.BeforeGet<TemporalColumnStorage> | null, isImmediateData);
            },

            tagged: (typeName, typeVars, tags) =>
            {
                return new TaggedColumnStorage(typeName, typeVars, tags, beforeGet as ColumnStorage.BeforeGet<TaggedColumnStorage> | null, isImmediateData);
            },

            record: (fields) =>
            {
                return new RecordColumnStorage(fields, beforeGet, isImmediateData);
            },

            array: (inner) =>
            {
                return new ArrayColumnStorage(inner, beforeGet as ColumnStorage.BeforeGet<ArrayColumnStorage> | null, isImmediateData);
            },
        };
        return inner.apply(visitor);
    }

    /** Java: Utility.cast(value, X.class), for the kinds of value; throws InternalException if value is not of the class. */
    public static castValue<T extends Value>(value: Value, cls: ValueClass<T>): T
    {
        if (!cls.is(value))
            throw new InternalException("Cannot cast " + javaClassName(value) + " into " + cls.javaName);
        return value;
    }
}
