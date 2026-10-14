// Port of xyz.columnal.data.KnownLengthRecordSet (data module).
import type { TableDataRowIndex } from "../../anns/Annotations.js";
import type { SimulationFunction } from "../../utility-functional/utility/function/simulation/SimulationFunction.js";
import type { Column } from "./Column.js";
import { RecordSet } from "./RecordSet.js";

/**
 * Created by neil on 07/12/2016.
 */
export class KnownLengthRecordSet extends RecordSet
{
    private readonly length: number;

    public constructor(columns: readonly SimulationFunction<RecordSet, Column>[], length: number)
    {
        super(columns);
        this.length = length;
    }

    public indexValid(index: number): boolean
    {
        return index < this.length;
    }

    public override getLength(): TableDataRowIndex
    {
        return this.length;
    }
}
