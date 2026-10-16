// Port of xyz.columnal.transformations.function.datetime.DaysBetween (functions module).
import { Decimal } from "../../../../java/JavaBigDecimal.js";
import { ChronoUnit, type Temporal } from "../../../../java/time/JavaTime.js";
import { ValueClass } from "../../../../types/data/datatype/DataType.js";
import { ValueFunction } from "../../../../expressions/transformations/expression/function/ValueFunction.js";
import type { DataType } from "../../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../types/data/datatype/DataTypeUtility.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../types/data/unit/Unit.js";
import type { Either } from "../../../../utility-adt/utility/adt/Either.js";
import type { Value } from "../../../../utility/utility/Value.js";
import { FunctionDefinition } from "../FunctionDefinition.js";

export class DaysBetween extends FunctionDefinition
{
    public constructor()
    {
        super("datetime:days between");
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new class extends ValueFunction
        {
            public override _call(): Value
            {
                // Java: arg(i, Temporal.class)
                const lhs = this.arg(0, ValueClass.TEMPORAL) as unknown as Temporal;
                const rhs = this.arg(1, ValueClass.TEMPORAL) as unknown as Temporal;
                return DataTypeUtility.value(new Decimal(ChronoUnit.DAYS.between(lhs, rhs)));
            }
        }();
    }
}
