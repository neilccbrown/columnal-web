// Port of xyz.columnal.data.TransformationRecordSet (data module).
import type { SimulationFunction } from "../../utility-functional/utility/function/simulation/SimulationFunction.js";
import { UserException } from "../../utility-error/error/UserException.js";
import type { Column } from "./Column.js";
import { RecordSet } from "./RecordSet.js";

export abstract class TransformationRecordSet extends RecordSet
{
    // Java has two constructors: () and (columns).
    public constructor(columns?: readonly SimulationFunction<RecordSet, Column>[])
    {
        super(columns);
    }

    public buildColumn(makeColumn: (rs: RecordSet) => Column): void
    {
        this.columns.push(makeColumn(this));
        if (new Set(this.columns.map(c => c.getName().getRaw())).size !== this.columns.length)
        {
            throw new UserException("Duplicate column names found");
        }
    }
}
