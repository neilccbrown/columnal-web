// Port of xyz.columnal.data.SparseErrorColumnStorage (data module).
//
// Java's inner class GetValueOrError (which subclasses define anonymously) becomes the
// SparseErrorColumnStorage.GetValueOrError interface of the three abstract methods, and
// getValueOrError() wraps one in a GetValue, as GetValueOrError's final methods did.
import { GetValue } from "../../types/data/datatype/DataTypeValue.js";
import type { DataTypeValue } from "../../types/data/datatype/DataTypeValue.js";
import type { ProgressListener } from "../../types/data/datatype/ProgressListener.js";
import { Either } from "../../utility-adt/utility/adt/Either.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { InvalidImmediateValueException } from "../../utility-error/error/InvalidImmediateValueException.js";
import { UserException } from "../../utility-error/error/UserException.js";
import { StyledString } from "../../utility-error/styled/StyledString.js";
import type { SimulationRunnable } from "../../utility-functional/utility/function/simulation/SimulationRunnable.js";
import type { Value } from "../../utility/utility/Value.js";
import type { ColumnStorage } from "./ColumnStorage.js";

export abstract class SparseErrorColumnStorage<T> implements ColumnStorage<T>
{
    // Is this an original data source (true), or storage for
    // calculated values (false)
    private readonly isImmediateData: boolean;
    // PORT-NOTE: Java's HashMap<Integer, String>; its iteration order is not observable here.
    private errorEntries = new Map<number, string>();
    // Max of errorEntries.keySet() or -1 if empty
    private latestError = -1;

    protected constructor(isImmediateData: boolean)
    {
        this.isImmediateData = isImmediateData;
    }

    public abstract filled(): number;

    public abstract addAll(items: Iterable<Either<string, T>>): void;

    public abstract getType(): DataTypeValue;

    // Java: ColumnStorage's default method
    public add(item: T): void
    {
        this.addAll([Either.right<string, T>(item)]);
    }

    protected getError(row: number): string | null
    {
        return this.errorEntries.get(row) ?? null;
    }

    protected setError(row: number, error: string): void
    {
        this.errorEntries.set(row, error);
        if (row > this.latestError)
            this.latestError = row;
    }

    private recalculateLatestError(): void
    {
        this.latestError = Math.max(-1, ...this.errorEntries.keys());
    }

    protected unsetError(row: number): void
    {
        this.errorEntries.delete(row);
        if (row >= this.latestError)
            this.recalculateLatestError();
    }

    private mapErrors(rowChange: (row: number) => number | null): Map<number, string>
    {
        // Need to be careful here not to overwrite keys which are swapping:
        const modified = new Map<number, string>();
        const removed = new Map<number, string>();
        this.errorEntries.forEach((v, k) =>
        {
            const newKey = rowChange(k);
            if (newKey !== null)
                modified.set(newKey, v);
            else
                removed.set(k, v);
        });
        this.errorEntries = modified;
        this.recalculateLatestError();
        return removed;
    }

    public getAllCollapsed(fromIncl: number, toExcl: number): Either<string, T>[]
    {
        const r: Either<string, T>[] = [];

        try
        {
            for (let i = fromIncl; i < toExcl; i++)
            {
                const error = this.getError(i);
                if (error !== null)
                    r.push(Either.left(error));
                else
                {
                    const collapsed = this.getType().getCollapsed(i) as T;
                    r.push(Either.right(collapsed));
                }

            }
        }
        catch (e)
        {
            if (e instanceof UserException)
                throw new InternalException("Unexpected user exception loading from column storage", e);
            throw e;
        }
        return r;
    }

    // Insert, but without doing errors at all, other than to add blanks where there is null
    protected abstract _insertRows(index: number, items: readonly (T | null)[]): SimulationRunnable;


    // Remove, but without doing errors at all
    protected abstract _removeRows(index: number, count: number): SimulationRunnable;

    // Returns revert operation
    public insertRows(index: number, itemsErr: readonly Either<string, T>[]): SimulationRunnable
    {
        const itemsSize = itemsErr.length;
        if (index <= this.latestError)
            this.mapErrors(i => i < index ? i : i + itemsSize);

        const items: (T | null)[] = [];
        for (let i = 0; i < itemsErr.length; i++)
        {
            const errOrValue = itemsErr[i]!;
            const iFinal = i;
            items.push(errOrValue.either<T | null>(err =>
            {
                this.setError(index + iFinal, err);
                return null;
            }, v =>
            {
                return v;
            }));
        }

        const revert = this._insertRows(index, items);
        return () =>
        {
            revert();
            this.mapErrors(i => i < index ? i : (i >= index + itemsSize ? i - itemsSize : null));
        };
    }

    // Returns revert operation
    public removeRows(index: number, count: number): SimulationRunnable
    {
        const revert = this._removeRows(index, count);
        const removed = this.mapErrors(i => i < index ? i : (i < index + count ? null : i - count));
        return () =>
        {
            this.mapErrors(i => i < index ? i : i + count);
            removed.forEach((v, k) => this.setError(k, v));
            revert();
        };
    }

    /** Java: new GetValueOrError<V>() { ... } */
    protected getValueOrError<V extends Value>(impl: SparseErrorColumnStorage.GetValueOrError<V>): GetValue<V>
    {
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- the inner class's outer instance
        const outer = this;
        return new class extends GetValue<V>
        {
            public override getWithProgress(index: number, progressListener: ProgressListener | null): V
            {
                // Must do this first in case it finds an error:
                impl._beforeGet(index, progressListener);
                const err = outer.getError(index);
                if (err !== null)
                {
                    if (outer.isImmediateData)
                        throw new InvalidImmediateValueException(StyledString.s("Invalid value: " + err), err);
                    else
                        throw new UserException(err);
                }
                else
                    return impl._getWithProgress(index, progressListener);
            }

            public override set(index: number, value: Either<string, V>): void
            {
                // PORT-NOTE: as in Java, clearing an error does not recalculate latestError.
                value.eitherEx_(err => { outer.setError(index, err); impl._set(index, null); },
                    v => { outer.errorEntries.delete(index); impl._set(index, v); });
            }
        }();
    }
}

export namespace SparseErrorColumnStorage
{
    /** The abstract methods of Java's inner class GetValueOrError */
    export interface GetValueOrError<V extends Value>
    {
        _beforeGet(index: number, progressListener: ProgressListener | null): void;

        _getWithProgress(index: number, progressListener: ProgressListener | null): V;

        _set(index: number, value: V | null): void;
    }
}
