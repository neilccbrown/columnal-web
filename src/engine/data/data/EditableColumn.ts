// Port of xyz.columnal.data.EditableColumn (data module).
import type { ColumnId } from "../../identifiers/id/ColumnId.js";
import type { SimulationRunnable } from "../../utility-functional/utility/function/simulation/SimulationRunnable.js";
import type { Value } from "../../utility/utility/Value.js";
import { Column } from "./Column.js";
import type { RecordSet } from "./RecordSet.js";

/**
 * Created by neil on 29/05/2017.
 */
export abstract class EditableColumn extends Column
{
    protected constructor(recordSet: RecordSet, name: ColumnId)
    {
        super(recordSet, name);
    }

    // Returns a revert operation
    public abstract insertRows(index: number, count: number): SimulationRunnable;

    // Returns a revert operation
    public abstract removeRows(index: number, count: number): SimulationRunnable;

    public isEditable(): boolean
    {
        return true;
    }

    public abstract override getDefaultValue(): Value;

    public override getAlteredState(): Column.AlteredState
    {
        // If we're editable, we must be new:
        return Column.AlteredState.OVERWRITTEN;
    }
}
