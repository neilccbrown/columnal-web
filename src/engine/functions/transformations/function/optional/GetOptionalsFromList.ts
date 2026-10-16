// Port of xyz.columnal.transformations.function.optional.GetOptionalsFromList (functions module).
import { ValueClass } from "../../../../types/data/datatype/DataType.js";
import { TaggedValue } from "../../../../utility/utility/TaggedValue.js";
import { ListExList, Utility, type ListEx } from "../../../../utility/utility/Utility.js";
import { ValueFunction1 } from "../ValueFunction1.js";
import type { ValueFunction } from "../../../../expressions/transformations/expression/function/ValueFunction.js";
import type { DataType } from "../../../../types/data/datatype/DataType.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../types/data/unit/Unit.js";
import type { Either } from "../../../../utility-adt/utility/adt/Either.js";
import type { Value } from "../../../../utility/utility/Value.js";
import { FunctionDefinition } from "../FunctionDefinition.js";

export class GetOptionalsFromList extends FunctionDefinition
{
    public constructor()
    {
        super("optional:get optionals from list");
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new class extends ValueFunction1<ListEx>
        {
            public override call1(srcList: ListEx): Value
            {
                const size = srcList.size();
                const present: Value[] = [];

                for (let i = 0; i < size; i++)
                {
                    const taggedValue = Utility.cast(srcList.get(i), TaggedValue);
                    const inner = taggedValue.getInner();
                    if (taggedValue.getTagIndex() === 1 && inner !== null)
                        present.push(inner);
                }

                return new ListExList(present);
            }
        }(ValueClass.LIST);
    }
}
