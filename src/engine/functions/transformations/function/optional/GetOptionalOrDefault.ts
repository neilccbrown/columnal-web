// Port of xyz.columnal.transformations.function.optional.GetOptionalOrDefault (functions module).
import type { FuncDocKey } from "../../../../anns/Annotations.js";
import { ValueClass } from "../../../../types/data/datatype/DataType.js";
import type { TaggedValue } from "../../../../utility/utility/TaggedValue.js";
import { ValueFunction2 } from "../ValueFunction2.js";
import type { ValueFunction } from "../../../../expressions/transformations/expression/function/ValueFunction.js";
import type { DataType } from "../../../../types/data/datatype/DataType.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../types/data/unit/Unit.js";
import type { Either } from "../../../../utility-adt/utility/adt/Either.js";
import type { Value } from "../../../../utility/utility/Value.js";
import { FunctionDefinition } from "../FunctionDefinition.js";

// Java's Object.class: any value
const OBJECT: ValueClass<Value> = { javaName: "class java.lang.Object", is: (_v): _v is Value => true };

export class GetOptionalOrDefault extends FunctionDefinition
{

    public static readonly NAME: FuncDocKey = "optional:get optional or";

    public constructor()
    {
        super(GetOptionalOrDefault.NAME);
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new class extends ValueFunction2<TaggedValue, Value>
        {
            public override call2(taggedValue: TaggedValue, defaultValue: Value): Value
            {
                const inner = taggedValue.getInner();
                if (taggedValue.getTagIndex() === 1 && inner !== null)
                    return inner;
                else
                    return defaultValue;
            }
        }(ValueClass.TAGGED, OBJECT);
    }
}
