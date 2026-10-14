// Port of xyz.columnal.data.MemoryRecordColumn (data module).
import type { ExpressionIdentifier } from "../../anns/Annotations.js";
import type { ColumnId } from "../../identifiers/id/ColumnId.js";
import { SpecificDataTypeVisitor, type DataType } from "../../types/data/datatype/DataType.js";
import type { DataTypeValue } from "../../types/data/datatype/DataTypeValue.js";
import { Either } from "../../utility-adt/utility/adt/Either.js";
import type { SimulationRunnable } from "../../utility-functional/utility/function/simulation/SimulationRunnable.js";
import { Utility, type Record } from "../../utility/utility/Utility.js";
import type { Column } from "./Column.js";
import { EditableColumn } from "./EditableColumn.js";
import { RecordColumnStorage } from "./RecordColumnStorage.js";
import type { RecordSet } from "./RecordSet.js";

/**
 * Created by neil on 31/10/2016.
 */
export class MemoryRecordColumn extends EditableColumn
{
    private readonly storage: RecordColumnStorage;
    private readonly defaultValue: Record;

    // Java has two constructors: with and without the values.
    public constructor(recordSet: RecordSet, title: ColumnId, dataTypes: ReadonlyMap<ExpressionIdentifier, DataType>, defaultValue: Record);
    public constructor(recordSet: RecordSet, title: ColumnId, dataTypes: ReadonlyMap<ExpressionIdentifier, DataType>, values: readonly Either<string, Record>[], defaultValue: Record);
    public constructor(recordSet: RecordSet, title: ColumnId, dataTypes: ReadonlyMap<ExpressionIdentifier, DataType>, d: readonly Either<string, Record>[] | Record, e?: Record)
    {
        super(recordSet, title);
        this.defaultValue = e ?? d as Record;
        this.storage = new RecordColumnStorage(dataTypes, true);
        if (e !== undefined)
            MemoryRecordColumn.addAllValue(this.storage, d as readonly Either<string, Record>[]);
    }

    private static addAllValue(storage: RecordColumnStorage, values: readonly Either<string, Record>[]): void
    {
        storage.addAll(values);
    }

    public getType(): DataTypeValue
    {
        return this.storage.getType();
    }

    public override _test_shrink(rs: RecordSet, shrunkLength: number): Column
    {
        const shrunk = new MemoryRecordColumn(rs, this.getName(), this.storage.getType().getType().apply(new class extends SpecificDataTypeVisitor<ReadonlyMap<ExpressionIdentifier, DataType>>
        {
            public override record(fields: ReadonlyMap<ExpressionIdentifier, DataType>): ReadonlyMap<ExpressionIdentifier, DataType>
            {
                return fields;
            }
        }()), this.defaultValue);
        shrunk.storage.addAll(this.storage.getAllCollapsed(0, shrunkLength));
        return shrunk;
    }

    public add(tuple: Either<string, Record>): void
    {
        this.storage.addAll([tuple]);
    }


    public insertRows(index: number, count: number): SimulationRunnable
    {
        return this.storage.insertRows(index, Utility.replicate(count, Either.right<string, Record>(this.defaultValue)));
    }

    public removeRows(index: number, count: number): SimulationRunnable
    {
        return this.storage.removeRows(index, count);
    }

    public getDefaultValue(): Record
    {
        return this.defaultValue;
    }
}
