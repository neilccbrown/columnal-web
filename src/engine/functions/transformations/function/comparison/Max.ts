// Port of xyz.columnal.transformations.function.comparison.Max (functions module).
import { ValueFunction } from "../../../../expressions/transformations/expression/function/ValueFunction.js";
import { ValueClass, type DataType } from "../../../../types/data/datatype/DataType.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../types/data/unit/Unit.js";
import type { Either } from "../../../../utility-adt/utility/adt/Either.js";
import { UserException } from "../../../../utility-error/error/UserException.js";
import { Utility } from "../../../../utility/utility/Utility.js";
import type { Value } from "../../../../utility/utility/Value.js";
import { FunctionDefinition } from "../FunctionDefinition.js";

export class Max extends FunctionDefinition
{
    public static readonly NAME = "maximum";

    public constructor()
    {
        super("comparison:maximum");
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new Max.Instance();
    }
}

export namespace Max
{
    export class Instance extends ValueFunction
    {
        public override _call(): Value
        {
            const list = this.arg(0, ValueClass.LIST);
            if (list.size() === 0)
            {
                throw new UserException("Cannot take minimum of empty list");
            }
            else
            {
                let max = list.get(0);
                for (let i = 1; i < list.size(); i++)
                {
                    const val = list.get(i);
                    if (Utility.compareValues(max, val) < 0)
                        max = val;
                }
                return max;
            }
        }
    }
}
