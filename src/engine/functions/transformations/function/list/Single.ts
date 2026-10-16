// Port of xyz.columnal.transformations.function.list.Single (functions module).
import { ValueClass } from "../../../../types/data/datatype/DataType.js";
import { UserException } from "../../../../utility-error/error/UserException.js";
import { ValueFunction } from "../../../../expressions/transformations/expression/function/ValueFunction.js";
import type { DataType } from "../../../../types/data/datatype/DataType.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../types/data/unit/Unit.js";
import type { Either } from "../../../../utility-adt/utility/adt/Either.js";
import type { Value } from "../../../../utility/utility/Value.js";
import { FunctionDefinition } from "../FunctionDefinition.js";

export class Single extends FunctionDefinition
{
    public constructor()
    {
        super("list:get single");
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new Single.Instance();
    }
}

export namespace Single
{
    export class Instance extends ValueFunction
    {
        public override _call(): Value
        {
            const list = this.arg(0, ValueClass.LIST);
            if (list.size() === 1)
                return list.get(0);
            else
                throw new UserException("List must be of size 1, but was size " + list.size());
        }
    }
}
