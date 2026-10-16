// Port of xyz.columnal.transformations.function.optional.GetOptionalOrError (functions module).
import { ValueClass } from "../../../../types/data/datatype/DataType.js";
import { UserException } from "../../../../utility-error/error/UserException.js";
import type { TaggedValue } from "../../../../utility/utility/TaggedValue.js";
import { ValueFunction1 } from "../ValueFunction1.js";
import type { ValueFunction } from "../../../../expressions/transformations/expression/function/ValueFunction.js";
import type { DataType } from "../../../../types/data/datatype/DataType.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../types/data/unit/Unit.js";
import type { Either } from "../../../../utility-adt/utility/adt/Either.js";
import type { Value } from "../../../../utility/utility/Value.js";
import { FunctionDefinition } from "../FunctionDefinition.js";

export class GetOptionalOrError extends FunctionDefinition
{
    public constructor()
    {
        super("optional:get optional");
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new class extends ValueFunction1<TaggedValue>
        {
            public override call1(taggedValue: TaggedValue): Value
            {
                const inner = taggedValue.getInner();
                if (taggedValue.getTagIndex() === 1 && inner !== null)
                    return inner;
                else
                    throw new UserException("get optional - missing value");
            }
        }(ValueClass.TAGGED);
    }
}
