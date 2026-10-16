// Port of xyz.columnal.transformations.function.core.TypeOf (functions module).
import type { ExpressionIdentifier } from "../../../../anns/Annotations.js";
import { ValueFunction } from "../../../../expressions/transformations/expression/function/ValueFunction.js";
import { TagType, type DataType } from "../../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../types/data/datatype/DataTypeUtility.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../types/data/unit/Unit.js";
import type { Either } from "../../../../utility-adt/utility/adt/Either.js";
import { TaggedValue } from "../../../../utility/utility/TaggedValue.js";
import type { Value } from "../../../../utility/utility/Value.js";
import { FunctionDefinition } from "../FunctionDefinition.js";

export class TypeOf extends FunctionDefinition
{
    public constructor()
    {
        super("core:type of");
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new TypeOf.Instance();
    }
}

export namespace TypeOf
{
    export class Instance extends ValueFunction
    {
        public override _call(): Value
        {
            // TODO return the actual type literal once we define the GADT
            return new TaggedValue(0, null, DataTypeUtility.fromTags([new TagType<unknown>("Type" as ExpressionIdentifier, null)]));
        }
    }
}
