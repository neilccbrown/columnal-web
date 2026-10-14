// Port of xyz.columnal.data.MemoryTemporalColumn (data module).
import type { ColumnId } from "../../identifiers/id/ColumnId.js";
import type { TemporalAccessor } from "../../java/time/TemporalAccessor.js";
import { SpecificDataTypeVisitor } from "../../types/data/datatype/DataType.js";
import type { DataTypeValue } from "../../types/data/datatype/DataTypeValue.js";
import type { DateTimeInfo } from "../../types/data/datatype/DateTimeInfo.js";
import { Either } from "../../utility-adt/utility/adt/Either.js";
import type { SimulationRunnable } from "../../utility-functional/utility/function/simulation/SimulationRunnable.js";
import { Utility } from "../../utility/utility/Utility.js";
import type { Value } from "../../utility/utility/Value.js";
import type { Column } from "./Column.js";
import { EditableColumn } from "./EditableColumn.js";
import type { RecordSet } from "./RecordSet.js";
import { TemporalColumnStorage } from "./TemporalColumnStorage.js";

/**
 * Created by neil on 30/11/2016.
 */
export class MemoryTemporalColumn extends EditableColumn
{
    private readonly storage: TemporalColumnStorage;
    private readonly defaultValue: TemporalAccessor;

    public constructor(rs: RecordSet, title: ColumnId, dateTimeInfo: DateTimeInfo, list: readonly Either<string, TemporalAccessor>[], defaultValue: TemporalAccessor)
    {
        super(rs, title);
        this.defaultValue = defaultValue;
        this.storage = new TemporalColumnStorage(dateTimeInfo, true);
        this.storage.addAll(list);
    }

    public getType(): DataTypeValue
    {
        return this.storage.getType();
    }

    public override _test_shrink(rs: RecordSet, shrunkLength: number): Column
    {
        return new MemoryTemporalColumn(rs, this.getName(), this.getType().getType().apply(new class extends SpecificDataTypeVisitor<DateTimeInfo>
        {
            public override date(dateTimeInfo: DateTimeInfo): DateTimeInfo
            {
                return dateTimeInfo;
            }
        }()), this.storage.getAllCollapsed(0, shrunkLength), this.defaultValue);
    }

    public add(value: Either<string, TemporalAccessor>): void
    {
        this.storage.addAll([value]);
    }


    public insertRows(index: number, count: number): SimulationRunnable
    {
        return this.storage.insertRows(index, Utility.replicate(count, Either.right<string, TemporalAccessor>(this.defaultValue)));
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
