// Port of xyz.columnal.transformations.function.comparison.MinIndex (functions module).
import { Decimal } from "../../../../java/JavaBigDecimal.js";
import { ValueFunction } from "../../../../expressions/transformations/expression/function/ValueFunction.js";
import { ValueClass, type DataType } from "../../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../types/data/datatype/DataTypeUtility.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../types/data/unit/Unit.js";
import type { Either } from "../../../../utility-adt/utility/adt/Either.js";
import { UserException } from "../../../../utility-error/error/UserException.js";
import { Utility } from "../../../../utility/utility/Utility.js";
import type { Value } from "../../../../utility/utility/Value.js";
import { FunctionDefinition } from "../FunctionDefinition.js";

export class MinIndex extends FunctionDefinition
{
    public static readonly NAME = "minimum index";

    public constructor()
    {
        super("comparison:minimum index");
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new MinIndex.Instance();
    }
}

export namespace MinIndex
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
                let min = list.get(0);
                let zeroIndexMin = 0;
                for (let i = 1; i < list.size(); i++)
                {
                    const val = list.get(i);
                    if (Utility.compareValues(min, val) > 0)
                    {
                        min = val;
                        zeroIndexMin = i;
                    }
                }
                // Add one to make it one-based:
                return DataTypeUtility.value(new Decimal(zeroIndexMin + 1));
            }
        }
    }
}
