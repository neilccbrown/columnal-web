// Port of xyz.columnal.transformations.function.core.AsType (functions module).
import type { FuncDocKey } from "../../../../anns/Annotations.js";
import { ValueFunction } from "../../../../expressions/transformations/expression/function/ValueFunction.js";
import type { DataType } from "../../../../types/data/datatype/DataType.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../types/data/unit/Unit.js";
import type { Either } from "../../../../utility-adt/utility/adt/Either.js";
import type { Value } from "../../../../utility/utility/Value.js";
import { FunctionDefinition } from "../FunctionDefinition.js";

export class AsType extends FunctionDefinition
{

    public static readonly NAME: FuncDocKey = "core:as type";

    public constructor()
    {
        super(AsType.NAME);
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new AsType.Instance();
    }
}

export namespace AsType
{
    export class Instance extends ValueFunction
    {
        public override _call(): Value
        {
            return this.arg(1);
        }
    }
}
