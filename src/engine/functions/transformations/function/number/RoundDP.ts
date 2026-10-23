// Port of xyz.columnal.transformations.function.number.RoundDP (functions module).
import { Decimal, setScale } from "../../../../java/JavaBigDecimal.js";
import { ValueClass } from "../../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../types/data/datatype/DataTypeUtility.js";
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
export class RoundDP extends FunctionDefinition
{
    public constructor()
    {
        super("number:round decimal");
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new class extends ValueFunction
        {
            public override _call(): Value
            {
                // PORT-NOTE: bug fix.  Java returned a whole number held as a Long unchanged, without
                // looking at the number of decimal places, but rounded one held as a BigDecimal:
                // round decimal(15, -1) was 15 but round decimal(1.5 * 10, -1) was 20, and
                // round decimal(15, 0.5) was 15 rather than an error.  Here every number is rounded.
                return DataTypeUtility.value(setScale(this.arg(0, ValueClass.NUMBER), this.intArg(1), Decimal.ROUND_HALF_UP));
            }
        }();

    }
}
