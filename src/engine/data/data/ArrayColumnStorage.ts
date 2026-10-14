// Port of xyz.columnal.data.ArrayColumnStorage (data module).
import { javaListAddAll } from "../../java/JavaCollections.js";
import type { DataType } from "../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../types/data/datatype/DataTypeUtility.js";
import { DataTypeValue } from "../../types/data/datatype/DataTypeValue.js";
import type { Either } from "../../utility-adt/utility/adt/Either.js";
import type { SimulationRunnable } from "../../utility-functional/utility/function/simulation/SimulationRunnable.js";
import { ListEx } from "../../utility/utility/Utility.js";
import type { ColumnStorage } from "./ColumnStorage.js";
import { SparseErrorColumnStorage } from "./SparseErrorColumnStorage.js";

/**
 * For some reason, thi is the difficult one to wrap your head around.  An array
 * is a vector of items, which could be a vector of strings, a vector of tagged items,
 * or a vector of arrays.  Several crucial facts:
 *
 *  - Since this is a column storage, each item is one row, which is itself an array.
 *  - This storage only stores the head (in Haskell terms)
 *    of the item, not the full item, which might be cached elsewhere (e.g. if this storage
 *    is the result of a sort, no point duplicating the array).
 *
 * Thus the storage is just a list of DataTypeValue, i.e. accessors of the array content.
 */
export class ArrayColumnStorage extends SparseErrorColumnStorage<ListEx> implements ColumnStorage<ListEx>
{
    // We are a column storage.  Each element here is one row, which is also
    // a list because it is an array.  We are a list of lists (column of arrays)
    private readonly storage: ListEx[] = [];
    private readonly type: DataTypeValue;

    // Constructor for array version
    public constructor(innerToCopy: DataType, beforeGet: ColumnStorage.BeforeGet<ArrayColumnStorage> | null, isImmediateData: boolean)
    {
        super(isImmediateData);
        this.type = DataTypeValue.array(innerToCopy, this.getValueOrError<ListEx>({
            _getWithProgress: (i, _prog) =>
            {
                return this.storage[i]!;
            },

            _beforeGet: (i, prog) =>
            {
                if (beforeGet !== null)
                    beforeGet(this, i, prog);
            },

            _set: (index, v) =>
            {
                this.storage[index] = v === null ? ListEx.empty() : v;
            },
        }));
    }

    public filled(): number
    {
        return this.storage.length;
    }

    public addAll(items: Iterable<Either<string, ListEx>>): void
    {
        for (const item of items)
        {
            this.storage.push(DataTypeUtility.value(item.either<ListEx>(err =>
            {
                this.setError(this.storage.length, err);
                return ListEx.empty();
            }, l => l)));
        }
    }

    public getType(): DataTypeValue
    {
        return this.type;
    }

    protected override _insertRows(index: number, items: readonly (ListEx | null)[]): SimulationRunnable
    {
        javaListAddAll(this.storage, index, items.map(item => DataTypeUtility.value(item ?? ListEx.empty())));
        const count = items.length;
        return () => { this._removeRows(index, count); };
    }

    protected override _removeRows(index: number, count: number): SimulationRunnable
    {
        const old = this.storage.splice(index, count);
        return () => { javaListAddAll(this.storage, index, old); };
    }
}
