// Port of xyz.columnal.data.EditableRecordSet (data module).
import type { ExpressionIdentifier, TableDataRowIndex } from "../../anns/Annotations.js";
import type { ColumnId } from "../../identifiers/id/ColumnId.js";
import { HashMap } from "../../java/HashMap.js";
import { ZERO, type Decimal } from "../../java/JavaBigDecimal.js";
import { Platform } from "../../java/Platform.js";
import type { TemporalAccessor } from "../../java/time/TemporalAccessor.js";
import { ValueClass, type DataType, type TagType } from "../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../types/data/datatype/DataTypeUtility.js";
import type { DataTypeVisitorGet, GetValue } from "../../types/data/datatype/DataTypeValue.js";
import type { DateTimeInfo } from "../../types/data/datatype/DateTimeInfo.js";
import type { NumberInfo } from "../../types/data/datatype/NumberInfo.js";
import type { TypeId } from "../../types/data/datatype/TypeId.js";
import type { Unit } from "../../types/data/unit/Unit.js";
import { Either } from "../../utility-adt/utility/adt/Either.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { InvalidImmediateValueException } from "../../utility-error/error/InvalidImmediateValueException.js";
import { UserException } from "../../utility-error/error/UserException.js";
import type { SimulationFunction } from "../../utility-functional/utility/function/simulation/SimulationFunction.js";
import type { SimulationRunnable } from "../../utility-functional/utility/function/simulation/SimulationRunnable.js";
import { ErrorHandler } from "../../utility/log/ErrorHandler.js";
import type { TaggedValue } from "../../utility/utility/TaggedValue.js";
import { TranslationUtility } from "../../utility/utility/TranslationUtility.js";
import { ListExList, RecordMap, Utility, type ListEx, type Record } from "../../utility/utility/Utility.js";
import type { Value } from "../../utility/utility/Value.js";
import type { Column } from "./Column.js";
import { ColumnUtility } from "./ColumnUtility.js";
import { EditableColumn } from "./EditableColumn.js";
import { MemoryArrayColumn } from "./MemoryArrayColumn.js";
import { MemoryBooleanColumn } from "./MemoryBooleanColumn.js";
import { MemoryNumericColumn } from "./MemoryNumericColumn.js";
import { MemoryRecordColumn } from "./MemoryRecordColumn.js";
import { MemoryStringColumn } from "./MemoryStringColumn.js";
import { MemoryTaggedColumn } from "./MemoryTaggedColumn.js";
import { MemoryTemporalColumn } from "./MemoryTemporalColumn.js";
import { RecordSet } from "./RecordSet.js";

/**
 * Created by neil on 08/03/2017.
 */
export class EditableRecordSet extends RecordSet
{
    private readonly editableColumns: EditableColumn[];
    // Not final, because we are editable.  But it is the exact length of the dataset
    // (not the length loaded so far, or similar)
    private curLength: number;

    /**
     * Java has two constructors:
     *  - (columns, loadLength): loadLength loads the data, and returns the length of the data set
     *  - (RecordSet copyFrom): copies the columns of copyFrom
     */
    public constructor(columns: readonly SimulationFunction<RecordSet, EditableColumn>[], loadLength: () => number);
    public constructor(copyFrom: RecordSet);
    public constructor(a: readonly SimulationFunction<RecordSet, EditableColumn>[] | RecordSet, b?: () => number)
    {
        const columns = a instanceof RecordSet ? Utility.mapList(a.getColumns(), EditableRecordSet.copyColumn) : a;
        const loadLength = a instanceof RecordSet ? () => a.getLength() : b!;
        super(columns);
        // Can't fail given the type we require above:
        this.editableColumns = Utility.mapList(this.getColumns(), c => c as EditableColumn);
        this.curLength = loadLength();
    }

    public static copyColumn(this: void, original: Column): SimulationFunction<RecordSet, EditableColumn>
    {
        const defaultValue: Value | null = (original instanceof EditableColumn) ? original.getDefaultValue() : null;

        return rs =>
        {
            const getAll = <T extends Value>(g: GetValue<T>): Either<string, T>[] =>
            {
                const r: Either<string, T>[] = [];
                for (let i = 0; original.indexValid(i); i++)
                {
                    try
                    {
                        const t = g.get(i);
                        r.push(Either.right(t));
                    }
                    catch (e)
                    {
                        if (!(e instanceof InvalidImmediateValueException))
                            throw e;
                        r.push(Either.left(e.getInvalid()));
                    }
                }
                return r;
            };
            const visitor: DataTypeVisitorGet<EditableColumn> = {
                number: (g: GetValue<Decimal>, displayInfo: NumberInfo): EditableColumn =>
                {
                    return new MemoryNumericColumn(rs, original.getName(), displayInfo, getAll(g), ColumnUtility.castValue(Utility.replaceNull(defaultValue, ZERO), ValueClass.NUMBER));
                },

                text: (g: GetValue<string>): EditableColumn =>
                {
                    return new MemoryStringColumn(rs, original.getName(), getAll(g), ColumnUtility.castValue(Utility.replaceNull(defaultValue, DataTypeUtility.value("")), ValueClass.STRING));
                },

                bool: (g: GetValue<boolean>): EditableColumn =>
                {
                    return new MemoryBooleanColumn(rs, original.getName(), getAll(g), ColumnUtility.castValue(Utility.replaceNull(defaultValue, DataTypeUtility.value(false)), ValueClass.BOOLEAN));
                },

                date: (dateTimeInfo: DateTimeInfo, g: GetValue<TemporalAccessor>): EditableColumn =>
                {
                    return new MemoryTemporalColumn(rs, original.getName(), dateTimeInfo, getAll(g), ColumnUtility.castValue(Utility.replaceNull(defaultValue, dateTimeInfo.getDefaultValue()), ValueClass.TEMPORAL));
                },

                tagged: (typeName: TypeId, typeVars: readonly Either<Unit, DataType>[], tagTypes: readonly TagType<DataType>[], g: GetValue<TaggedValue>): EditableColumn =>
                {
                    const r: Either<string, TaggedValue>[] = [];
                    for (let i = 0; original.indexValid(i); i++)
                    {
                        try
                        {
                            r.push(Either.right(g.get(i)));
                        }
                        catch (e)
                        {
                            if (!(e instanceof InvalidImmediateValueException))
                                throw e;
                            r.push(Either.left(e.getInvalid()));
                        }
                    }
                    return new MemoryTaggedColumn(rs, original.getName(), typeName, typeVars, tagTypes, r, ColumnUtility.castValue(Utility.replaceNull(defaultValue, DataTypeUtility.makeDefaultTaggedValue(tagTypes)), ValueClass.TAGGED));
                },

                record: (types: ReadonlyMap<ExpressionIdentifier, DataType>, g: GetValue<Record>): EditableColumn =>
                {
                    const r: Either<string, Record>[] = [];
                    for (let index = 0; original.indexValid(index); index++)
                    {
                        try
                        {
                            r.push(Either.right<string, Record>(ColumnUtility.castValue(g.get(index), ValueClass.RECORD)));
                        }
                        catch (e)
                        {
                            if (!(e instanceof InvalidImmediateValueException))
                                throw e;
                            r.push(Either.left(e.getInvalid()));
                        }
                    }
                    // PORT-NOTE: Java's HashMap, whose order the RecordMap keeps.
                    const recordOfDefaults = HashMap.javaOrder<ExpressionIdentifier, Value>();
                    for (const [key, value] of types)
                    {
                        recordOfDefaults.set(key, DataTypeUtility.makeDefaultValue(value));
                    }
                    return new MemoryRecordColumn(rs, original.getName(), types, r, ColumnUtility.castValue(Utility.replaceNull(defaultValue, DataTypeUtility.value(new RecordMap(recordOfDefaults))), ValueClass.RECORD));
                },

                array: (inner: DataType, g: GetValue<ListEx>): EditableColumn =>
                {
                    const r: Either<string, ListEx>[] = [];
                    for (let index = 0; original.indexValid(index); index++)
                    {
                        try
                        {
                            const details = g.get(index);
                            const array: Value[] = [];
                            for (let indexInArray = 0; indexInArray < details.size(); indexInArray++)
                            {
                                // Need to look for indexInArray, not index, to get full list:
                                array.push(details.get(indexInArray));
                            }
                            r.push(Either.right(DataTypeUtility.value(array)));
                        }
                        catch (e)
                        {
                            if (!(e instanceof InvalidImmediateValueException))
                                throw e;
                            r.push(Either.left(e.getInvalid()));
                        }
                    }
                    return new MemoryArrayColumn(rs, original.getName(), inner, r, ColumnUtility.castValue(Utility.replaceNull(defaultValue, new ListExList([])), ValueClass.LIST));
                },
            };
            return original.getType().applyGet(visitor);
        };
    }

    public static newRecordSetSingleColumn(name: ColumnId, type: DataType, defaultValue: Value): EditableRecordSet
    {
        const maker = ColumnUtility.makeImmediateColumn(type, name, defaultValue);
        return new EditableRecordSet([rs => maker.apply(rs)], () => 0);
    }

    public indexValid(index: number): boolean
    {
        return index < this.curLength;
    }

    public override getLength(): TableDataRowIndex
    {
        return this.curLength;
    }

    // The return is for testing
    public insertRows(index: number, count: number): SimulationRunnable | null
    {
        const revert: SimulationRunnable[] = [];
        try
        {
            for (const column of this.editableColumns)
            {
                revert.push(column.insertRows(index, count));
            }
        }
        catch (e)
        {
            if (!(e instanceof InternalException || e instanceof UserException))
                throw e;
            ErrorHandler.getErrorHandler().showError(TranslationUtility.getString("error.inserting.rows"), e);
            for (const revertOne of revert)
            {
                try
                {
                    revertOne();
                }
                catch (e2)
                {
                    if (!(e2 instanceof InternalException))
                        throw e2;
                    ErrorHandler.getErrorHandler().showError(TranslationUtility.getString("error.reversing.row.insertion"), e2);
                }
            }
            return null;
        }

        this.curLength += count;
        if (this.listener !== null)
        {
            const listenerFinal = this.listener;
            Platform.runLater(() => listenerFinal.removedAddedRows(index, 0, count));
        }
        // Re-run dependents:
        this.modified(null, null);

        return () =>
        {
            for (const revertOne of revert)
            {
                revertOne();
            }
            this.curLength -= count;
        };
    }

    // The return is for testing
    public removeRows(deleteIndex: number, count: number): SimulationRunnable | null
    {
        const revert: SimulationRunnable[] = [];
        try
        {
            for (const column of this.editableColumns)
            {
                revert.push(column.removeRows(deleteIndex, count));
            }
        }
        catch (e)
        {
            if (!(e instanceof InternalException || e instanceof UserException))
                throw e;
            ErrorHandler.getErrorHandler().showError(TranslationUtility.getString("error.removing.rows"), e);
            for (const revertOne of revert)
            {
                try
                {
                    revertOne();
                }
                catch (e2)
                {
                    if (!(e2 instanceof InternalException))
                        throw e2;
                    ErrorHandler.getErrorHandler().showError(TranslationUtility.getString("error.reversing.row.removal"), e2);
                }
            }
            return null;
        }

        this.curLength -= count;
        if (this.listener !== null)
        {
            const listenerFinal = this.listener;
            Platform.runLater(() => listenerFinal.removedAddedRows(deleteIndex, count, 0));
        }
        // Re-run dependents
        this.modified(null, null);

        return () =>
        {
            for (const revertOne of revert)
            {
                revertOne();
            }
            this.curLength += count;
        };
    }

    public addColumn(addBefore: ColumnId | null, makeNewColumn: (rs: RecordSet) => EditableColumn): void
    {
        const col = makeNewColumn(this);
        col.insertRows(0, this.getLength());
        const targetIndex = addBefore === null ? this.columns.length : (Utility.findFirstIndex(this.columns, c => c.getName().equals(addBefore)) ?? this.columns.length);
        this.columns.splice(targetIndex, 0, col);
        this.editableColumns.splice(targetIndex, 0, col);
        if (new Set(this.columns.map(c => c.getName().getRaw())).size !== this.columns.length)
        {
            throw new UserException("Duplicate column names found");
        }
        Platform.runLater(() =>
        {
            if (this.listener !== null)
                this.listener.addedColumn(col);
        });
        //Re-run dependents:
        this.modified(col.getName(), null);
    }

    public deleteColumn(deleteColumnName: ColumnId): void
    {
        const removeIf = (list: Column[]): void =>
        {
            for (let i = list.length - 1; i >= 0; i--)
                if (list[i]!.getName().equals(deleteColumnName))
                    list.splice(i, 1);
        };
        removeIf(this.columns);
        removeIf(this.editableColumns);
        Platform.runLater(() =>
        {
            if (this.listener !== null)
                this.listener.removedColumn(deleteColumnName);
        });
        //Re-run dependents:
        this.modified(deleteColumnName, null);
    }
}
