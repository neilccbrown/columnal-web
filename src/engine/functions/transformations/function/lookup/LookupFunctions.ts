// Port of xyz.columnal.transformations.function.lookup.LookupFunctions (functions module).
import { javaListGet } from "../../../../java/JavaCollections.js";
import { ValueClass } from "../../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../types/data/datatype/DataTypeUtility.js";
import { UserException } from "../../../../utility-error/error/UserException.js";
import { ListEx, Utility } from "../../../../utility/utility/Utility.js";
import { ValueFunction } from "../../../../expressions/transformations/expression/function/ValueFunction.js";
import type { DataType } from "../../../../types/data/datatype/DataType.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../types/data/unit/Unit.js";
import type { Either } from "../../../../utility-adt/utility/adt/Either.js";
import type { Value } from "../../../../utility/utility/Value.js";
import { FunctionDefinition } from "../FunctionDefinition.js";

export class LookupFunctions
{
    public static getLookupFunctions(): readonly FunctionDefinition[]
    {
        return [
            new class extends FunctionDefinition
            {
                public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
                {
                    return ValueFunction.value(new class extends ValueFunction
                    {
                        public override _call(): Value
                        {
                            const listA = this.arg(0, ValueClass.LIST);
                            const listB = this.arg(2, ValueClass.LIST);

                            if (listA.size() !== listB.size())
                                throw new UserException("Lists passed to lookup function must be the same size, but first list was size: " + listA.size() + " and second list was size: " + listB.size());

                            const index = LookupFunctions.getSingleItem(LookupFunctions.lookupIndexes(listA, this.arg(1)), this.arg(1));
                            return listB.get(index);
                        }
                    }());
                }
            }("lookup:lookup"),
            new class extends FunctionDefinition
            {
                public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
                {
                    return ValueFunction.value(new class extends ValueFunction
                    {
                        public override _call(): Value
                        {
                            const listA = this.arg(0, ValueClass.LIST);
                            const listB = this.arg(2, ValueClass.LIST);

                            if (listA.size() !== listB.size())
                                throw new UserException("Lists passed to lookup function must be the same size, but first list was size: " + listA.size() + " and second list was size: " + listB.size());

                            const indexes = LookupFunctions.getAllItems(LookupFunctions.lookupIndexes(listA, this.arg(1)));
                            return DataTypeUtility.value(new class extends ListEx
                            {
                                public override size(): number
                                {
                                    return indexes.length;
                                }

                                public override get(index: number): Value
                                {
                                    return listB.get(javaListGet(indexes, index));
                                }
                            }());
                        }
                    }());
                }
            }("lookup:lookup all"),
        ];
    }

    private static getAllItems(nextIndex: () => number | null): number[]
    {
        const r: number[] = [];
        let next: number | null;
        do
        {
            next = nextIndex();
            if (next !== null)
                r.push(next);
        }
        while (next !== null);
        return r;
    }

    private static getSingleItem(nextIndex: () => number | null, target: Value): number
    {
        // Check that there's one:
        const first = nextIndex();
        if (first === null)
            throw new UserException("No matching item found in lookup function for " + DataTypeUtility.valueToString(target));
        const second = nextIndex();
        if (second !== null)
            throw new UserException("More than one matching item found in lookup function for " + DataTypeUtility.valueToString(target));
        return first;
    }

    // Gets the next index, or empty if successfully reached end of list and found no more:
    // Java: returns a SimulationSupplier<OptionalInt>
    private static lookupIndexes(targetList: ListEx, item: Value): () => number | null
    {
        let nextToCheck = 0;
        return () => {
            for (let i = nextToCheck; i < targetList.size(); i++)
            {
                if (Utility.compareValues(targetList.get(i), item) === 0)
                {
                    nextToCheck = i + 1;
                    return i;
                }
            }
            return null;
        };
    }
}
