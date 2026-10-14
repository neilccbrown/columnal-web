// Port of xyz.columnal.data.TemporalColumnStorage (data module).
import { javaListAddAll } from "../../java/JavaCollections.js";
import type { TemporalAccessor } from "../../java/time/TemporalAccessor.js";
import { DataTypeUtility } from "../../types/data/datatype/DataTypeUtility.js";
import { DataTypeValue } from "../../types/data/datatype/DataTypeValue.js";
import type { DateTimeInfo } from "../../types/data/datatype/DateTimeInfo.js";
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
export class TemporalColumnStorage extends SparseErrorColumnStorage<TemporalAccessor> implements ColumnStorage<TemporalAccessor>
{
    private readonly values: TemporalAccessor[];
    private readonly pool: DumbObjectPool<TemporalAccessor>;
    private readonly dateTimeInfo: DateTimeInfo;

    private dataType: DataTypeValue | null = null;
    private readonly beforeGet: ColumnStorage.BeforeGet<TemporalColumnStorage> | null;

    public constructor(dateTimeInfo: DateTimeInfo, isImmediateData: boolean);
    public constructor(dateTimeInfo: DateTimeInfo, beforeGet: ColumnStorage.BeforeGet<TemporalColumnStorage> | null, isImmediateData: boolean);
    public constructor(dateTimeInfo: DateTimeInfo, b: ColumnStorage.BeforeGet<TemporalColumnStorage> | null | boolean, c?: boolean)
    {
        super(typeof b === "boolean" ? b : c!);
        this.values = [];
        this.pool = new DumbObjectPool<TemporalAccessor>(1000, dateTimeInfo.getComparator(true));
        this.dateTimeInfo = dateTimeInfo;
        this.beforeGet = typeof b === "boolean" ? null : b;
    }

    public filled(): number
    {
        return this.values.length;
    }

    private get(index: number, _progressListener: ProgressListener | null): TemporalAccessor
    {
        if (index < 0 || index >= this.filled())
            throw new UserException("Attempting to access invalid element: " + index + " of " + this.filled());
        return this.values[index]!;
    }

    public addAll(items: Iterable<Either<string, TemporalAccessor>>): void
    {
        for (const item of items)
        {
            const t = item.eitherInt(err =>
            {
                this.setError(this.values.length, err);
                return this.dateTimeInfo.getDefaultValue();
            }, v => v);
            let value = DataTypeUtility.value(this.dateTimeInfo, t);
            if (value === null)
            {
                this.setError(this.values.length, t.toString());
                value = this.dateTimeInfo.getDefaultValue();
            }
            this.values.push(this.pool.pool(value));
        }
    }

    public getType(): DataTypeValue
    {
        if (this.dataType === null)
        {
            this.dataType = DataTypeValue.date(this.dateTimeInfo, this.getValueOrError<TemporalAccessor>({
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
                    if (value !== null)
                        this.values[index] = value;
                },
            }));
        }
        return this.dataType;
    }

    protected override _insertRows(index: number, items: readonly (TemporalAccessor | null)[]): SimulationRunnable
    {
        if (index < 0 || index > this.values.length)
            throw new InternalException("Trying to insert rows at invalid index: " + index + " length is: " + this.values.length);
        const toInsert: TemporalAccessor[] = [];
        for (const item of items)
        {
            const itemValue = item === null ? null : DataTypeUtility.value(this.dateTimeInfo, item);
            if (itemValue === null)
            {
                const dummy = this.dateTimeInfo.getDefaultValue();
                toInsert.push(this.pool.pool(dummy));
            }
            else
                toInsert.push(this.pool.pool(itemValue));
        }
        javaListAddAll(this.values, index, toInsert);
        const count = items.length;
        return () => { this._removeRows(index, count); };
    }

    protected override _removeRows(index: number, count: number): SimulationRunnable
    {
        if (index < 0 || index > this.values.length)
            throw new InternalException("Trying to remove rows at invalid index: " + index + " length is: " + this.values.length);
        const old = this.values.splice(index, count);
        return () => { javaListAddAll(this.values, index, old); };
    }
}
