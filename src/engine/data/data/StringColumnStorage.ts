// Port of xyz.columnal.data.StringColumnStorage (data module).
import { javaListAddAll } from "../../java/JavaCollections.js";
import { DataTypeValue } from "../../types/data/datatype/DataTypeValue.js";
import type { ProgressListener } from "../../types/data/datatype/ProgressListener.js";
import type { Either } from "../../utility-adt/utility/adt/Either.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { UserException } from "../../utility-error/error/UserException.js";
import type { SimulationRunnable } from "../../utility-functional/utility/function/simulation/SimulationRunnable.js";
import { DumbObjectPool } from "../../utility/utility/DumbObjectPool.js";
import type { ColumnStorage } from "./ColumnStorage.js";
import { SparseErrorColumnStorage } from "./SparseErrorColumnStorage.js";

/**
 * Created by neil on 04/11/2016.
 */
export class StringColumnStorage extends SparseErrorColumnStorage<string> implements ColumnStorage<string>
{
    private readonly values: string[];
    private readonly pool = new DumbObjectPool<string>(1000, null);
    private readonly beforeGet: ColumnStorage.BeforeGet<StringColumnStorage> | null;

    private dataType: DataTypeValue | null = null;

    // Java has two constructors: (BeforeGet, boolean) and (boolean).
    public constructor(isImmediateData: boolean);
    public constructor(beforeGet: ColumnStorage.BeforeGet<StringColumnStorage> | null, isImmediateData: boolean);
    public constructor(a: ColumnStorage.BeforeGet<StringColumnStorage> | null | boolean, b?: boolean)
    {
        super(typeof a === "boolean" ? a : b!);
        this.values = [];
        this.beforeGet = typeof a === "boolean" ? null : a;
    }

    public filled(): number
    {
        return this.values.length;
    }

    private get(index: number, _progressListener: ProgressListener | null): string
    {
        if (index < 0 || index >= this.values.length)
            throw new UserException("Attempting to access invalid element: " + index + " of " + this.values.length);
        return this.values[index]!;
    }

    public addAll(items: Iterable<Either<string, string>>): void
    {
        for (const item of items)
        {
            const s = item.either(_err => "", v => v);
            item.ifLeft(err => this.setError(this.values.length, err));
            this.values.push(this.pool.pool(s));
        }
    }

    public getType(): DataTypeValue
    {
        if (this.dataType === null)
        {
            this.dataType = DataTypeValue.text(this.getValueOrError<string>({
                _beforeGet: (index, progressListener) =>
                {
                    if (this.beforeGet !== null)
                        this.beforeGet(this, index, progressListener);

                },

                _getWithProgress: (i, prog) =>
                {
                    return this.get(i, prog);
                },

                _set: (index, value) =>
                {
                    if (value === null)
                        value = "";

                    this.setValue(index, value);
                },
            }));
        }
        return this.dataType;
    }

    public setValue(index: number, value: string): void
    {
        if (index === this.values.length)
        {
            this.values.push(this.pool.pool(value));

        }
        else
        {
            this.values[index] = this.pool.pool(value);
        }
    }

    protected override _insertRows(index: number, items: readonly (string | null)[]): SimulationRunnable
    {
        if (index < 0 || index > this.values.length)
            throw new InternalException("Trying to insert rows at invalid index: " + index + " length is: " + this.values.length);
        javaListAddAll(this.values, index, items.map(item => this.pool.pool(item ?? "")));
        const count = items.length;
        return () => { this._removeRows(index, count); };
    }

    protected override _removeRows(index: number, count: number): SimulationRunnable
    {
        if (index < 0 || index + count > this.values.length)
            throw new InternalException("Trying to remove rows at invalid index: " + index + " + " + count + " length is: " + this.values.length);
        const old = this.values.splice(index, count);
        return () => { javaListAddAll(this.values, index, old); };
    }
}
