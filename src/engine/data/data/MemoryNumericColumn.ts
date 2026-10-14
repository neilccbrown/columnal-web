// Port of xyz.columnal.data.MemoryNumericColumn (data module).
import type { ColumnId } from "../../identifiers/id/ColumnId.js";
import { ZERO, type Decimal } from "../../java/JavaBigDecimal.js";
import type { DataTypeValue } from "../../types/data/datatype/DataTypeValue.js";
import type { NumberInfo } from "../../types/data/datatype/NumberInfo.js";
import { Either } from "../../utility-adt/utility/adt/Either.js";
import type { SimulationRunnable } from "../../utility-functional/utility/function/simulation/SimulationRunnable.js";
import { Utility } from "../../utility/utility/Utility.js";
import type { Value } from "../../utility/utility/Value.js";
import type { Column } from "./Column.js";
import { EditableColumn } from "./EditableColumn.js";
import { NumericColumnStorage } from "./NumericColumnStorage.js";
import type { RecordSet } from "./RecordSet.js";

/**
 * Created by neil on 31/10/2016.
 */
export class MemoryNumericColumn extends EditableColumn
{
    private readonly storage: NumericColumnStorage;
    private readonly defaultValue: Decimal;

    /**
     * Java has two public constructors: (rs, title, numberInfo, List<Either<String, Number>> values, defaultValue)
     * and (rs, title, numberInfo, Stream<String> values), which reads the strings, with default value 0.
     */
    public constructor(rs: RecordSet, title: ColumnId, numberInfo: NumberInfo, values: readonly Either<string, Decimal>[], defaultValue: Decimal);
    public constructor(rs: RecordSet, title: ColumnId, numberInfo: NumberInfo, values: Iterable<string>);
    public constructor(rs: RecordSet, title: ColumnId, numberInfo: NumberInfo, values: readonly Either<string, Decimal>[] | Iterable<string>, defaultValue?: Decimal)
    {
        super(rs, title);
        this.defaultValue = defaultValue ?? ZERO;
        this.storage = new NumericColumnStorage(numberInfo, true);
        if (defaultValue !== undefined)
            this.storage.addAll(values as readonly Either<string, Decimal>[]);
        else
        {
            for (const value of values as Iterable<string>)
            {
                this.storage.addRead(value);
            }
        }
    }

    public add(value: Either<string, Decimal>): void
    {
        this.storage.addAll([value]);
    }

    public getType(): DataTypeValue
    {
        return this.storage.getType();
    }

    public override _test_shrink(rs: RecordSet, shrunkLength: number): Column
    {
        return new MemoryNumericColumn(rs, this.getName(), this.storage.getDisplayInfo(), this.storage.getAllCollapsed(0, shrunkLength), ZERO);
    }

    public insertRows(index: number, count: number): SimulationRunnable
    {
        return this.storage.insertRows(index, Utility.replicate(count, Either.right<string, Decimal>(this.defaultValue)));
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
