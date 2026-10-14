// Port of xyz.columnal.data.MemoryStringColumn (data module).
import type { ColumnId } from "../../identifiers/id/ColumnId.js";
import { DataTypeUtility } from "../../types/data/datatype/DataTypeUtility.js";
import type { DataTypeValue } from "../../types/data/datatype/DataTypeValue.js";
import { Either } from "../../utility-adt/utility/adt/Either.js";
import type { SimulationRunnable } from "../../utility-functional/utility/function/simulation/SimulationRunnable.js";
import { Utility } from "../../utility/utility/Utility.js";
import type { Value } from "../../utility/utility/Value.js";
import type { Column } from "./Column.js";
import { EditableColumn } from "./EditableColumn.js";
import type { RecordSet } from "./RecordSet.js";
import { StringColumnStorage } from "./StringColumnStorage.js";

/**
 * Created by neil on 31/10/2016.
 */
export class MemoryStringColumn extends EditableColumn
{
    private readonly storage: StringColumnStorage;
    private readonly defaultValue: string;

    public constructor(recordSet: RecordSet, title: ColumnId, values: readonly Either<string, string>[], defaultValue: string)
    {
        super(recordSet, title);
        this.defaultValue = DataTypeUtility.value(defaultValue);
        this.storage = new StringColumnStorage(true);
        this.storage.addAll(values);
    }

    public add(value: Either<string, string>): void
    {
        this.storage.addAll([value]);
    }

    public getType(): DataTypeValue
    {
        return this.storage.getType();
    }

    public override _test_shrink(rs: RecordSet, shrunkLength: number): Column
    {
        return new MemoryStringColumn(rs, this.getName(), this.storage.getAllCollapsed(0, shrunkLength), "");
    }

    public insertRows(index: number, count: number): SimulationRunnable
    {
        return this.storage.insertRows(index, Utility.replicate(count, Either.right<string, string>(this.defaultValue)));
    }

    public removeRows(index: number, count: number): SimulationRunnable
    {
        return this.storage.removeRows(index, count);
    }

    public getDefaultValue(): Value
    {
        return this.defaultValue;
    }

    // Used by InferTypeColumn to easily directly access the values:
    public setValue(index: number, value: string): void
    {
        this.storage.setValue(index, value);
    }
}
