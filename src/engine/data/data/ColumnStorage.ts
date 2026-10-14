// Port of xyz.columnal.data.ColumnStorage (data module).
// PORT-NOTE: Java Streams of items become arrays.  The default method add is implemented in
// SparseErrorColumnStorage, which every storage extends.
import type { DataTypeValue } from "../../types/data/datatype/DataTypeValue.js";
import type { ProgressListener } from "../../types/data/datatype/ProgressListener.js";
import type { Either } from "../../utility-adt/utility/adt/Either.js";
import type { SimulationRunnable } from "../../utility-functional/utility/function/simulation/SimulationRunnable.js";

/**
 * Created by neil on 04/11/2016.
 */
export interface ColumnStorage<T>
{
    // The amount currently stored.  Do not assume this is all available data,
    // as many columns will be loaded/calculated on demand.
    filled(): number;

    // Java: a default method, adding Either.right(item)
    add(item: T): void;

    addAll(items: Iterable<Either<string, T>>): void;

    getType(): DataTypeValue;

    getAllCollapsed(fromIncl: number, toExcl: number): Either<string, T>[];

    // Returns revert operation
    insertRows(index: number, items: readonly Either<string, T>[]): SimulationRunnable;
    // Returns revert operation
    removeRows(index: number, count: number): SimulationRunnable;
}

export namespace ColumnStorage
{
    /** Java: a functional interface */
    export type BeforeGet<S extends ColumnStorage<unknown>> = (storage: S, index: number, progressListener: ProgressListener | null) => void;
}
