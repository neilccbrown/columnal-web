// Port of xyz.columnal.transformations.function.Mean (functions module).
import { ValueFunction } from "../../../expressions/transformations/expression/function/ValueFunction.js";
import { Decimal } from "../../../java/JavaBigDecimal.js";
import { ValueClass, type DataType } from "../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import type { TypeManager } from "../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../types/data/unit/Unit.js";
import type { Either } from "../../../utility-adt/utility/adt/Either.js";
import { UserException } from "../../../utility-error/error/UserException.js";
import { Utility } from "../../../utility/utility/Utility.js";
import type { Value } from "../../../utility/utility/Value.js";
import { SingleNumericSummaryFunction } from "./SingleNumericSummaryFunction.js";

/**
 * Created by neil on 22/01/2017.
 */
export class Mean extends SingleNumericSummaryFunction
{
    public static readonly NAME = "average";

    public constructor()
    {
        super("number:average");
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new class extends ValueFunction
        {
            public override _call(): Value
            {
                const list = this.arg(0, ValueClass.LIST);
                const size = list.size();
                if (size === 0)
                    throw new UserException("Cannot calculate average of empty list");
                let average = DataTypeUtility.value(new Decimal(0));
                for (let i = 0; i < size; i++)
                {
                    // From http://stackoverflow.com/questions/1346824/is-there-any-way-to-find-arithmetic-mean-better-than-sum-n
                    average = Utility.addSubtractNumbers(average, Utility.divideNumbers(Utility.addSubtractNumbers(Utility.valueNumber(list.get(i)), average, false), DataTypeUtility.value(new Decimal(i + 1))), true);
                }
                return average;
            }
        }();
    }
}
