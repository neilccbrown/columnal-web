// Port of xyz.columnal.transformations.function.math.LogarithmNatural (functions module).
import type { ValueFunction } from "../../../../expressions/transformations/expression/function/ValueFunction.js";
import * as BigDecimalMath from "../../../../java/BigDecimalMath.js";
import { ArithmeticException, type Decimal } from "../../../../java/JavaBigDecimal.js";
import { ValueClass, type DataType } from "../../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../types/data/datatype/DataTypeUtility.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../types/data/unit/Unit.js";
import type { Either } from "../../../../utility-adt/utility/adt/Either.js";
import { UserException } from "../../../../utility-error/error/UserException.js";
import { Utility } from "../../../../utility/utility/Utility.js";
import type { Value } from "../../../../utility/utility/Value.js";
import { FunctionDefinition } from "../FunctionDefinition.js";
import { ValueFunction1 } from "../ValueFunction1.js";

export class LogarithmNatural extends FunctionDefinition
{
    public constructor()
    {
        super("math:log natural");
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new class extends ValueFunction1<Decimal>
        {

            public override call1(x: Decimal): Value
            {
                try
                {
                    const bd = Utility.toBigDecimal(x);
                    return DataTypeUtility.value(BigDecimalMath.log(bd, BigDecimalMath.MathContext.DECIMAL128));
                }
                catch (e)
                {
                    if (!(e instanceof ArithmeticException))
                        throw e;
                    throw new UserException("Error while taking logarithm: " + e.message, e);
                }
            }
        }(ValueClass.NUMBER);
    }
}
