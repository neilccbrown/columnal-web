// Port of xyz.columnal.data.RecordColumnStorage (data module).
import type { ExpressionIdentifier } from "../../anns/Annotations.js";
import type { DataType } from "../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../types/data/datatype/DataTypeUtility.js";
import { DataTypeValue, GetValue } from "../../types/data/datatype/DataTypeValue.js";
import type { ProgressListener } from "../../types/data/datatype/ProgressListener.js";
import { Either } from "../../utility-adt/utility/adt/Either.js";
import type { SimulationRunnable } from "../../utility-functional/utility/function/simulation/SimulationRunnable.js";
import { RecordMap, type Record } from "../../utility/utility/Utility.js";
import type { Value } from "../../utility/utility/Value.js";
import { ColumnUtility } from "./ColumnUtility.js";
import type { ColumnStorage } from "./ColumnStorage.js";
import { SparseErrorColumnStorage } from "./SparseErrorColumnStorage.js";

/**
 * Created by neil on 03/01/2017.
 */
export class RecordColumnStorage extends SparseErrorColumnStorage<Record> implements ColumnStorage<Record>
{
    // A record like {a: Text, b: Number} is stored in two column storages, one for all the a values, one for all the b
    private readonly storage: ReadonlyMap<ExpressionIdentifier, ColumnStorage<Value>>;
    private readonly type: DataTypeValue;

    // Java has two constructors: with and without beforeGet.
    public constructor(fields: ReadonlyMap<ExpressionIdentifier, DataType>, isImmediateData: boolean);
    public constructor(fields: ReadonlyMap<ExpressionIdentifier, DataType>, beforeGet: ColumnStorage.BeforeGet<never> | null, isImmediateData: boolean);
    public constructor(fields: ReadonlyMap<ExpressionIdentifier, DataType>, b: ColumnStorage.BeforeGet<never> | null | boolean, c?: boolean)
    {
        const isImmediateData = typeof b === "boolean" ? b : c!;
        const beforeGet = typeof b === "boolean" ? null : b;
        super(isImmediateData);
        const builder = new Map<ExpressionIdentifier, ColumnStorage<Value>>();
        for (const [key, value] of fields)
        {
            builder.set(key, ColumnUtility.makeColumnStorage(value, beforeGet, isImmediateData));
        }
        const storage = builder;
        this.storage = storage;
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- the anonymous class's outer instance
        const outer = this;
        this.type = DataTypeValue.record([...storage].map(([k, s]) => [k, s.getType().getType()] as const), new class extends GetValue<Record>
        {
            public override getWithProgress(index: number, _progressListener: ProgressListener | null): Record
            {
                const record = new Map<ExpressionIdentifier, Value>();
                for (const [key, value] of storage)
                {
                    record.set(key, value.getType().getCollapsed(index));
                }
                return DataTypeUtility.value(new RecordMap(record));
            }

            public override set(index: number, value: Either<string, Record>): void
            {
                value.eitherEx_(err =>
                {
                    outer.setError(index, err);
                    for (const columnStorage of storage.values())
                    {
                        columnStorage.getType().setCollapsed(index, Either.left(err));
                    }
                }, record =>
                {
                    outer.unsetError(index);
                    for (const [key, value] of storage)
                    {
                        value.getType().setCollapsed(index, Either.right(record.getField(key)));
                    }
                });
            }
        }());
    }

    public filled(): number
    {
        let min: number | null = null;
        for (const s of this.storage.values())
            min = min === null ? s.filled() : Math.min(min, s.filled());
        return min ?? 0;
    }

    public addAll(items: Iterable<Either<string, Record>>): void
    {
        // Each Object[] is one tuple record, add each element to each storage
        for (const item of items)
        {
            item.eitherInt_(s =>
            {
                this.setError(this.filled(), s);
                for (const columnStorage of this.storage.values())
                {
                    columnStorage.addAll([Either.left<string, Value>(s)]);
                }
            }, record =>
            {
                for (const [key, value] of this.storage)
                {
                    value.add(record.getField(key));
                }
            });
        }
    }

    public getType(): DataTypeValue
    {
        return this.type;
    }

    protected override _insertRows(index: number, items: readonly (Record | null)[]): SimulationRunnable
    {
        const reverts: SimulationRunnable[] = [];
        try
        {
            for (const [key, storage] of this.storage)
            {
                // Note: can't use mapList here as it contains nulls
                const r: Either<string, Value>[] = [];
                for (const item of items)
                {
                    if (item === null)
                        r.push(Either.left<string, Value>(""));
                    else
                        r.push(Either.right<string, Value>(item.getField(key)));
                }

                reverts.push(storage.insertRows(index, r));
            }
            return () =>
            {
                for (const revert of reverts)
                {
                    revert();
                }
            };
        }
        catch (e)
        {
            // Java: catches InternalException
            for (const revert of reverts)
            {
                revert();
            }
            throw e;
        }
    }

    protected override _removeRows(index: number, count: number): SimulationRunnable
    {
        const reverts: SimulationRunnable[] = [];
        try
        {
            for (const columnStorage of this.storage.values())
            {
                reverts.push(columnStorage.removeRows(index, count));
            }
            return () =>
            {
                for (const revert of reverts)
                {
                    revert();
                }
            };
        }
        catch (e)
        {
            // Java: catches InternalException
            for (const revert of reverts)
            {
                revert();
            }
            throw e;
        }

    }
}
