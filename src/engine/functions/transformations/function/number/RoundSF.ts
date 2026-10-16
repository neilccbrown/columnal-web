// Port of xyz.columnal.transformations.function.number.RoundSF (functions module).
import { Decimal, setScale } from "../../../../java/JavaBigDecimal.js";
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
export class RoundSF extends FunctionDefinition
{
    public constructor()
    {
        super("number:round significant");
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new class extends ValueFunction
        {
            public override _call(): Value
            {
                // From https://stackoverflow.com/questions/7572309/any-neat-way-to-limit-significant-figures-with-bigdecimal
                let bd = Utility.toBigDecimal(this.arg(0, ValueClass.NUMBER));
                // PORT-NOTE: Java's precision() - scale() is the same for 2.5 and 2.50, so it
                // doesn't matter that our numbers have no trailing zeros.  (For zero, Java's
                // 0.00 and 0 give different scales, but zero rounds to zero either way.)
                const newScale = this.intArg(1) - bd.precision(true) + bd.decimalPlaces();

                bd = setScale(bd, newScale, Decimal.ROUND_HALF_UP);
                return DataTypeUtility.value(bd);
            }
        }();

    }
}
