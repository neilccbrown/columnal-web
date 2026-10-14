// Port of xyz.columnal.data.MemoryBooleanColumn (data module).
import type { ColumnId } from "../../identifiers/id/ColumnId.js";
import { DataTypeUtility } from "../../types/data/datatype/DataTypeUtility.js";
import type { DataTypeValue } from "../../types/data/datatype/DataTypeValue.js";
import { Either } from "../../utility-adt/utility/adt/Either.js";
import type { SimulationRunnable } from "../../utility-functional/utility/function/simulation/SimulationRunnable.js";
import { Utility } from "../../utility/utility/Utility.js";
import type { Value } from "../../utility/utility/Value.js";
import { BooleanColumnStorage } from "./BooleanColumnStorage.js";
import type { Column } from "./Column.js";
import { EditableColumn } from "./EditableColumn.js";
import type { RecordSet } from "./RecordSet.js";

/**
 * Created by neil on 30/11/2016.
 */
export class MemoryBooleanColumn extends EditableColumn
{
    private readonly storage: BooleanColumnStorage;
    private readonly defaultValue: boolean;

    public constructor(rs: RecordSet, title: ColumnId, list: readonly Either<string, boolean>[], defaultValue: boolean)
    {
        super(rs, title);
        this.defaultValue = DataTypeUtility.value(defaultValue);
        this.storage = new BooleanColumnStorage(true);
        this.storage.addAll(list);
    }

    public getType(): DataTypeValue
    {
        return this.storage.getType();
    }

    public override _test_shrink(rs: RecordSet, shrunkLength: number): Column
    {
        return new MemoryBooleanColumn(rs, this.getName(), this.storage.getAllCollapsed(0, shrunkLength), false);
    }

    public add(b: Either<string, boolean>): void
    {
        this.storage.addAll([b]);
    }

    public insertRows(index: number, count: number): SimulationRunnable
    {
        return this.storage.insertRows(index, Utility.replicate(count, Either.right<string, boolean>(this.defaultValue)));
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
