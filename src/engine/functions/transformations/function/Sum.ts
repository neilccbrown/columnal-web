// Port of xyz.columnal.transformations.function.Sum (functions module).
import { ValueFunction } from "../../../expressions/transformations/expression/function/ValueFunction.js";
import { ValueClass, type DataType } from "../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import type { TypeManager } from "../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../types/data/unit/Unit.js";
import type { Either } from "../../../utility-adt/utility/adt/Either.js";
import type { Value } from "../../../utility/utility/Value.js";
import { Decimal } from "../../../java/JavaBigDecimal.js";
import { Utility } from "../../../utility/utility/Utility.js";
import { SingleNumericSummaryFunction } from "./SingleNumericSummaryFunction.js";

/**
 * Created by neil on 19/01/2017.
 */
export class Sum extends SingleNumericSummaryFunction
{
    public static readonly NAME = "sum";

    public constructor()
    {
        super("number:sum");
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new Sum.Instance();
    }
}

export namespace Sum
{
    export class Instance extends ValueFunction
    {
        public override _call(): Value
        {
            // If there are non-integers this will get widened.  And if not, it will stay Integer
            // which will be faster:
            let total = DataTypeUtility.value(new Decimal(0));
            const list = this.arg(0, ValueClass.LIST);
            const size = list.size();
            for (let i = 0; i < size; i++)
            {
                total = Utility.addSubtractNumbers(total, Utility.valueNumber(list.get(i)), true);
            }
            return total;
        }
    }
}
