// Port of xyz.columnal.data.BooleanColumnStorage (data module).
// PORT-NOTE: Java's BitSet is a boolean array here (unset entries read as false, like a BitSet).
import { DataTypeValue } from "../../types/data/datatype/DataTypeValue.js";
import type { ProgressListener } from "../../types/data/datatype/ProgressListener.js";
import type { Either } from "../../utility-adt/utility/adt/Either.js";
import { UserException } from "../../utility-error/error/UserException.js";
import type { SimulationRunnable } from "../../utility-functional/utility/function/simulation/SimulationRunnable.js";
import type { ColumnStorage } from "./ColumnStorage.js";
import { SparseErrorColumnStorage } from "./SparseErrorColumnStorage.js";

/**
 * Created by neil on 08/12/2016.
 */
export class BooleanColumnStorage extends SparseErrorColumnStorage<boolean> implements ColumnStorage<boolean>
{
    private length = 0;
    private data: boolean[] = [];
    private readonly type: DataTypeValue;
    private readonly beforeGet: ColumnStorage.BeforeGet<BooleanColumnStorage> | null;

    // Java has two constructors: (BeforeGet, boolean) and (boolean).
    public constructor(isImmediateData: boolean);
    public constructor(beforeGet: ColumnStorage.BeforeGet<BooleanColumnStorage> | null, isImmediateData: boolean);
    public constructor(a: ColumnStorage.BeforeGet<BooleanColumnStorage> | null | boolean, b?: boolean)
    {
        super(typeof a === "boolean" ? a : b!);
        const beforeGet = typeof a === "boolean" ? null : a;
        this.beforeGet = beforeGet;
        this.type = DataTypeValue.bool(this.getValueOrError<boolean>({
            _beforeGet: (index, progressListener) =>
            {
                if (beforeGet !== null)
                    beforeGet(this, index, progressListener);
            },

            _getWithProgress: (i, progressListener) =>
            {
                return this.getWithProgress(i, progressListener);
            },

            _set: (index, value) =>
            {
                this.data[index] = value !== null ? value : false;
            },
        }));
    }

    private getWithProgress(i: number, _progressListener: ProgressListener | null): boolean
    {
        if (i < 0 || i >= this.filled())
            throw new UserException("Attempting to access invalid element: " + i + " of " + this.filled());
        return this.data[i] === true;
    }

    public filled(): number
    {
        return this.length;
    }

    public addAll(items: Iterable<Either<string, boolean>>): void
    {
        for (const item of items)
        {
            item.either_(e => this.setError(this.length, e), b => { this.data[this.length] = b; });
            this.length += 1;
        }
    }

    public getType(): DataTypeValue
    {
        return this.type;
    }

    protected override _insertRows(index: number, items: readonly (boolean | null)[]): SimulationRunnable
    {
        const count = items.length;
        // Could probably do this faster:
        // Shift up the existing bits; go downwards to avoid overlap issues:
        for (let i = this.length - 1; i >= index; i--)
            this.data[i + count] = this.data[i] === true;
        // Initialise bits to false:
        for (let i = index; i < index + count; i++)
            this.data[i] = false;
        for (let i = 0; i < count; i++)
        {
            const destIndex = index + i;
            const item = items[i];
            if (item !== null && item !== undefined)
                this.data[destIndex] = item;
        }
        this.length += count;
        return () => { this._removeRows(index, count); };
    }

    protected override _removeRows(index: number, count: number): SimulationRunnable
    {
        // Could save some memory here:
        const old = [...this.data];
        for (let i = index; i < this.length - count; i++)
            this.data[i] = this.data[i + count] === true;
        this.length -= count;
        return () =>
        {
            this.data = old;
            this.length += count;
        };
    }
}
