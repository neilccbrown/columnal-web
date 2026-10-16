// Port of xyz.columnal.transformations.function.number.RoundDP (functions module).
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
                // PORT-NOTE: as in Java, a whole number (a Java Long) is returned unchanged, even
                // for a negative number of decimal places.  In Java, a whole number that was held as
                // a BigDecimal (such as the result of 1.5 * 10) was rounded to a multiple of ten
                // for -1, so round decimal(1.5 * 10, -1) was 20 there but is 15 here.
                return Utility.withNumber<Value>(this.arg(0, ValueClass.NUMBER), x => decimalFromBigInt(x), d => DataTypeUtility.value(setScale(d, this.intArg(1), Decimal.ROUND_HALF_UP)));
            }
        }();

    }
}
