// Port of xyz.columnal.data.CalculatedColumn (data module).
// (The large commented-out fold method and PrimitiveCalculatedColumn class in the Java are omitted.)
import type { ColumnId } from "../../identifiers/id/ColumnId.js";
import type { ProgressListener } from "../../types/data/datatype/ProgressListener.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { Column } from "./Column.js";
import type { ColumnStorage } from "./ColumnStorage.js";
import type { RecordSet } from "./RecordSet.js";

/**
 * Created by neil on 21/10/2016.
 */
export abstract class CalculatedColumn<S extends ColumnStorage<unknown>> extends Column
{
    public constructor(recordSet: RecordSet, name: ColumnId)
    {
        super(recordSet, name);
    }

    // Java: implements BeforeGet<S>
    public beforeGet(_storage: S, index: number, _progressListener: ProgressListener | null): void
    {
        if (index < 0 || index >= this.getLength())
            return; // Will later throw out of bounds problem

        let filled = this.getCacheFilled();
        // Fetch values:
        while (index >= filled)
        {
            const prevFilled = filled;
            this.fillNextCacheChunk();
            filled = this.getCacheFilled();
            if (filled <= prevFilled)
            {
                throw new InternalException("Looking for index " + index + " but cache not growing beyond size " + filled + " length should be: " + this.getLength());
            }
        }
    }

    protected abstract fillNextCacheChunk(): void;

    protected abstract getCacheFilled(): number;
}
