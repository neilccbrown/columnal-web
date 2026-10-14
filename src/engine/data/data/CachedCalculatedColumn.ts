// Port of xyz.columnal.data.CachedCalculatedColumn (data module).
import type { ColumnId } from "../../identifiers/id/ColumnId.js";
import type { DataTypeValue } from "../../types/data/datatype/DataTypeValue.js";
import { Either } from "../../utility-adt/utility/adt/Either.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { UserException } from "../../utility-error/error/UserException.js";
import { Log } from "../../utility/log/Log.js";
import { CalculatedColumn } from "./CalculatedColumn.js";
import { Column } from "./Column.js";
import type { ColumnStorage } from "./ColumnStorage.js";
import type { RecordSet } from "./RecordSet.js";

/**
 * Created by neil on 14/01/2017.
 */
export class CachedCalculatedColumn<T, S extends ColumnStorage<T>> extends CalculatedColumn<S>
{
    private readonly cache: S;
    private readonly calculateItem: (index: number) => T;
    private readonly cacheType: DataTypeValue;

    public constructor(recordSet: RecordSet, name: ColumnId, cache: (beforeGet: ColumnStorage.BeforeGet<S>) => S, calculateItem: (index: number) => T, addManualEdit: (original: DataTypeValue) => DataTypeValue)
    {
        super(recordSet, name);
        this.calculateItem = calculateItem;
        this.cache = cache((storage, index, progressListener) => this.beforeGet(storage, index, progressListener));
        this.cacheType = addManualEdit(this.cache.getType());
    }

    public getType(): DataTypeValue
    {
        return this.cacheType;
    }

    protected fillNextCacheChunk(): void
    {
        let value: Either<string, T>;
        try
        {
            value = Either.right(this.calculateItem(this.cache.filled()));
        }
        catch (e)
        {
            if (!(e instanceof InternalException || e instanceof UserException))
                throw e;
            if (e instanceof InternalException)
                Log.log(e);
            value = Either.left(e.getLocalizedMessage());
        }

        this.cache.addAll([value]);
    }

    protected getCacheFilled(): number
    {
        return this.cache.filled();
    }

    public getAlteredState(): Column.AlteredState
    {
        return Column.AlteredState.OVERWRITTEN;
    }
}
