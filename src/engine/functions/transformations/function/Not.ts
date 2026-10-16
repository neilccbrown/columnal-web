// Port of xyz.columnal.transformations.function.Not (functions module).
import { ValueFunction } from "../../../expressions/transformations/expression/function/ValueFunction.js";
import { ValueClass, type DataType } from "../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import type { TypeManager } from "../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../types/data/unit/Unit.js";
import type { Either } from "../../../utility-adt/utility/adt/Either.js";
import type { Value } from "../../../utility/utility/Value.js";
import { FunctionDefinition } from "./FunctionDefinition.js";

export class Not extends FunctionDefinition
{
    public constructor()
    {
        super("boolean:not");
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new Not.Instance();
    }
}

export namespace Not
{
    export class Instance extends ValueFunction
    {
        public override _call(): Value
        {
            return DataTypeUtility.value(!this.arg(0, ValueClass.BOOLEAN));
        }
    }
}
