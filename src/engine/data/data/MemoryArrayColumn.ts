// Port of xyz.columnal.data.MemoryArrayColumn (data module).
import type { ColumnId } from "../../identifiers/id/ColumnId.js";
import { SpecificDataTypeVisitor, type DataType } from "../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../types/data/datatype/DataTypeUtility.js";
import type { DataTypeValue } from "../../types/data/datatype/DataTypeValue.js";
import { Either } from "../../utility-adt/utility/adt/Either.js";
import type { SimulationRunnable } from "../../utility-functional/utility/function/simulation/SimulationRunnable.js";
import { Utility, type ListEx } from "../../utility/utility/Utility.js";
import type { Value } from "../../utility/utility/Value.js";
import { ArrayColumnStorage } from "./ArrayColumnStorage.js";
import type { Column } from "./Column.js";
import { EditableColumn } from "./EditableColumn.js";
import type { RecordSet } from "./RecordSet.js";

/**
 * Created by neil on 31/10/2016.
 */
export class MemoryArrayColumn extends EditableColumn
{
    private readonly storage: ArrayColumnStorage;
    private readonly defaultValue: ListEx;

    public constructor(recordSet: RecordSet, title: ColumnId, inner: DataType, values: readonly Either<string, ListEx>[], defaultValue: ListEx)
    {
        super(recordSet, title);
        this.defaultValue = DataTypeUtility.value(defaultValue);
        this.storage = new ArrayColumnStorage(inner, null, true);
        this.storage.addAll(values);
    }

    public getType(): DataTypeValue
    {
        return this.storage.getType();
    }

    public override _test_shrink(rs: RecordSet, shrunkLength: number): Column
    {
        const shrunk = new MemoryArrayColumn(rs, this.getName(), this.storage.getType().getType().apply(new class extends SpecificDataTypeVisitor<DataType>
        {
            public override array(inner: DataType): DataType
            {
                return inner;
            }
        }()), this.storage.getAllCollapsed(0, shrunkLength), this.defaultValue);
        return shrunk;
    }

    public add(listEx: Either<string, ListEx>): void
    {
        this.storage.addAll([listEx]);
    }


    public insertRows(index: number, count: number): SimulationRunnable
    {
        return this.storage.insertRows(index, Utility.replicate(count, Either.right<string, ListEx>(this.defaultValue)));
    }

    public removeRows(index: number, count: number): SimulationRunnable
    {
        return this.storage.removeRows(index, count);
    }

    public getDefaultValue(): Value
    {
        return this.defaultValue;
    }
}
