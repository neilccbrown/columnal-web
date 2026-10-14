// Port of xyz.columnal.data.Column (data module).
import type { TableDataRowIndex } from "../../anns/Annotations.js";
import type { ColumnId } from "../../identifiers/id/ColumnId.js";
import type { DataTypeValue } from "../../types/data/datatype/DataTypeValue.js";
import type { Pair } from "../../utility-adt/utility/adt/Pair.js";
import type { Value } from "../../utility/utility/Value.js";
import type { RecordSet } from "./RecordSet.js";
import { Table } from "./Table.js";

/**
 * A column of data in a RecordSet.
 *
 * Column assumptions:
 *   - There is only one Column object for a particular column.  So you
 *     can use (==) to compare two columns for equality.
 *   - A Column always belongs to exactly one RecordSet.
 *   - A column has a fixed name.  getName() will always return the same
 *     value.
 *   - A Column has typed entries.  Because the columntype is only known at
 *     run-time, we can't use generics, but you can assume that get(int)
 *     always returns the same columntype of object for the entire lifetime
 *     of this Column object (we may need to revisit this if we introduce
 *     algebraic data types).
 *   - The data in a column is immutable while getVersion() returns the
 *     same number.  I.e. any change in data will always be accompanied
 *     by an increase in the version.
 *   - Columns have a fixed size, but this is not always known a priori.
 *     So while there is a fixed unchanging limit on the data (unless
 *     getVersion's return increases), you can't just ask how much data there is.
 *     Instead you must use the indexValid method (or indexProgress) to
 *     ask if that item exists.  It is always true that if indexValid(i)==true,
 *     indexValid(j) == true for 0 <= j <= i.
 *   - Currently, data is loaded sequentially.  So if indexProgress(i) > 1.0
 *     then indexProgress(j) > 1.0 for 0 <= j <= i, but we may revisit this
 *     if we let data load in a random order.  It is definitely always true
 *     that if indexProgress(j) > 0 then indexValid(j)
 */
export abstract class Column
{
    protected readonly recordSet: RecordSet;
    private readonly name: ColumnId;

    protected constructor(recordSet: RecordSet, name: ColumnId)
    {
        this.recordSet = recordSet;
        this.name = name;
    }

    public getName(): ColumnId
    {
        return this.name;
    }

    public abstract getType(): DataTypeValue;

    public indexValid(index: number): boolean
    {
        return this.recordSet.indexValid(index);
    }

    public getLength(): number
    {
        return this.recordSet.getLength();
    }

    public getEditableStatus(): Column.EditableStatus
    {
        return new Column.EditableStatus(true, null);
    }

    // For testing: return copy of column with length trimmed to shrunkLength
    public _test_shrink(_rs: RecordSet, _shrunkLength: number): Column
    {
        throw new Error("Unshrinkable!");
    }

    /**
     * Gets the default value for this column, if any.
     * (Used for immediate columns which have a default for when
     * you add a new row.)  Null if N/A.
     */
    public getDefaultValue(): Value | null
    {
        return null;
    }

    /**
     * The predicate is only checked if display is CUSTOM
     */
    public shouldShow(columnSelection: Pair<Table.Display, (columnId: ColumnId) => boolean>): boolean
    {
        switch (columnSelection.getFirst())
        {
            case Table.Display.ALL:
                return true;
            case Table.Display.ALTERED:
                return this.getAlteredState() !== Column.AlteredState.UNALTERED;
            case Table.Display.CUSTOM:
                return columnSelection.getSecond()(this.getName());
        }
        return false;
    }

    /**
     * Is this column altered in this record set?
     * Used to decide whether we show column if display setting is set to ALTERED,
     * and to decide whether to warn in expression editor about column being changed.
     */
    public abstract getAlteredState(): Column.AlteredState;

    public getRecordSet(): RecordSet
    {
        return this.recordSet;
    }
}

export namespace Column
{
    export class EditableStatus
    {
        // If false, definitely not editable.  If true, run checkEditable
        public readonly editable: boolean;
        // Return true to continue the edit, false to abandon:
        public readonly checkEditable: ((rowIndex: TableDataRowIndex) => boolean) | null;

        public constructor(editable: boolean, checkEditable: ((rowIndex: TableDataRowIndex) => boolean) | null)
        {
            this.editable = editable;
            this.checkEditable = checkEditable;
        }
    }

    export enum AlteredState
    {
        // Completely unchanged from source table of transformation (e.g. unaltered column in Calculate):
        UNALTERED,
        // Rows removed or moved, e.g. Filter, Sort,
        FILTERED_OR_REORDERED,
        // Values changed, e.g. Calculate and Aggregate destination columns
        OVERWRITTEN
    }
}
