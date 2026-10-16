// Port of xyz.columnal.transformations.function.list.Combine (functions module).
import { ValueClass } from "../../../../types/data/datatype/DataType.js";
import { UserException } from "../../../../utility-error/error/UserException.js";
import { ValueFunction } from "../../../../expressions/transformations/expression/function/ValueFunction.js";
import type { DataType } from "../../../../types/data/datatype/DataType.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../types/data/unit/Unit.js";
import type { Either } from "../../../../utility-adt/utility/adt/Either.js";
import type { Value } from "../../../../utility/utility/Value.js";
import { FunctionDefinition } from "../FunctionDefinition.js";

// Foldr, by another name.
export class Combine extends FunctionDefinition
{
    public constructor()
    {
        super("listprocess:combine");
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new Combine.Instance();
    }
}

export namespace Combine
{
    export class Instance extends ValueFunction
    {
        public override _call(): Value
        {
            const list = this.arg(0, ValueClass.LIST);
            if (list.size() === 0)
                throw new UserException("Called combine with empty list");
            let acc = list.get(0);
            const fn = this.arg(1, ValueFunction.CLASS);
            for (let i = 1; i < list.size(); i++)
            {
                acc = fn.call([acc, list.get(i)]);
            }
            return acc;
        }
    }
}
