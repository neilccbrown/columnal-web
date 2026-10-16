// Port of xyz.columnal.transformations.function.list.CountWhere (functions module).
import { ValueClass } from "../../../../types/data/datatype/DataType.js";
import { Decimal } from "../../../../java/JavaBigDecimal.js";
import { DataTypeUtility } from "../../../../types/data/datatype/DataTypeUtility.js";
import { Utility, type ListEx } from "../../../../utility/utility/Utility.js";
import { ValueFunction2 } from "../ValueFunction2.js";
import { ValueFunction } from "../../../../expressions/transformations/expression/function/ValueFunction.js";
import type { DataType } from "../../../../types/data/datatype/DataType.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../types/data/unit/Unit.js";
import type { Either } from "../../../../utility-adt/utility/adt/Either.js";
import type { Value } from "../../../../utility/utility/Value.js";
import { FunctionDefinition } from "../FunctionDefinition.js";

export class CountWhere extends FunctionDefinition
{
    public constructor()
    {
        super("listprocess:count where");
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new class extends ValueFunction2<ListEx, ValueFunction>
        {
            public override call2(list: ListEx, keep: ValueFunction): Value
            {
                let count = 0;
                for (let i = 0; i < list.size(); i++)
                {
                    const x = list.get(i);
                    if (Utility.cast(keep.call([x]), Boolean))
                        count += 1;
                }

                return DataTypeUtility.value(new Decimal(count));
            }
        }(ValueClass.LIST, ValueFunction.CLASS);
    }
}
