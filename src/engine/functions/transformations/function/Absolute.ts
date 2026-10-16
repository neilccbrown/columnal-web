// Port of xyz.columnal.transformations.function.Absolute (functions module).
import { ValueFunction } from "../../../expressions/transformations/expression/function/ValueFunction.js";
import { decimalFromBigInt } from "../../../java/JavaBigDecimal.js";
import type { DataType } from "../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import type { TypeManager } from "../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../types/data/unit/Unit.js";
import type { Either } from "../../../utility-adt/utility/adt/Either.js";
import { Utility } from "../../../utility/utility/Utility.js";
import type { Value } from "../../../utility/utility/Value.js";
import { SingleNumericInOutFunction } from "./SingleNumericInOutFunction.js";

/**
 * Created by neil on 13/12/2016.
 */
export class Absolute extends SingleNumericInOutFunction
{
    public constructor()
    {
        super("number:abs");
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new class extends ValueFunction
        {
            public override _call(): Value
            {
                // Java negates Long.MIN_VALUE as a BigDecimal; a bigint can't overflow:
                return Utility.withNumber<Value>(this.arg(0), l => DataTypeUtility.value(decimalFromBigInt(l < 0n ? -l : l)), d => DataTypeUtility.value(d.abs()));
            }
        }();
    }

}
