// Port of xyz.columnal.transformations.function.list.JoinLists (functions module).
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

export class JoinLists extends FunctionDefinition
{
    public constructor()
    {
        super("list:join lists");
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new JoinLists.Instance();
    }
}

export namespace JoinLists
{
    export class Instance extends ValueFunction
    {
        public override _call(): Value
        {
            const listOfLists = this.arg(0, ValueClass.LIST);
            return DataTypeUtility.value(new class extends ListEx
            {
                private cachedSize = -1;

                public override size(): number
                {
                    if (this.cachedSize < 0)
                    {
                        this.cachedSize = 0;
                        for (let i = 0; i < listOfLists.size(); i++)
                        {
                            this.cachedSize += Utility.cast(listOfLists.get(i), ListEx).size();
                        }
                    }
                    return this.cachedSize;
                }

                public override get(index: number): Value
                {
                    // We could cache the individual list sizes.
                    for (let i = 0; i < listOfLists.size(); i++)
                    {
                        const subList = Utility.cast(listOfLists.get(i), ListEx);
                        const subListSize = subList.size();
                        if (index < subListSize)
                        {
                            return subList.get(index);
                        }
                        else
                        {
                            index -= subListSize;
                        }
                    }
                    // Add one to convert back to user index:
                    throw new UserException("Element index " + (index + 1) + " beyond end of list, which is of size " + this.size());
                }
            }());
        }
    }
}
