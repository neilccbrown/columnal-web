// Port of xyz.columnal.transformations.function.number.Round (functions module).
import { decimalFromBigInt, Decimal, setScale } from "../../../../java/JavaBigDecimal.js";
import { ValueClass } from "../../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../types/data/datatype/DataTypeUtility.js";
import { Utility } from "../../../../utility/utility/Utility.js";
import { ValueFunction } from "../../../../expressions/transformations/expression/function/ValueFunction.js";
import type { DataType } from "../../../../types/data/datatype/DataType.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../types/data/unit/Unit.js";
import type { Either } from "../../../../utility-adt/utility/adt/Either.js";
import type { Value } from "../../../../utility/utility/Value.js";
import { FunctionDefinition } from "../FunctionDefinition.js";

/**
 * Created by neil on 13/12/2016.
 */
export class Round extends FunctionDefinition
{
    public constructor()
    {
        super("number:round");
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new class extends ValueFunction
        {
            public override _call(): Value
            {
                return Utility.withNumber<Value>(this.arg(0, ValueClass.NUMBER), x => decimalFromBigInt(x), d => DataTypeUtility.value(setScale(d, 0, Decimal.ROUND_HALF_UP)));
            }
        }();
    }
}
