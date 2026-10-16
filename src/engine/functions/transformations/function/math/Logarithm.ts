// Port of xyz.columnal.transformations.function.math.Logarithm (functions module).
import type { ValueFunction } from "../../../../expressions/transformations/expression/function/ValueFunction.js";
import * as BigDecimalMath from "../../../../java/BigDecimalMath.js";
import { ArithmeticException, canonical, Decimal, type Decimal as DecimalType } from "../../../../java/JavaBigDecimal.js";
import { ValueClass, type DataType } from "../../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../types/data/datatype/DataTypeUtility.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../types/data/unit/Unit.js";
import type { Either } from "../../../../utility-adt/utility/adt/Either.js";
import { UserException } from "../../../../utility-error/error/UserException.js";
import { Utility } from "../../../../utility/utility/Utility.js";
import type { Value } from "../../../../utility/utility/Value.js";
import { FunctionDefinition } from "../FunctionDefinition.js";
import { ValueFunction2 } from "../ValueFunction2.js";

const MathContext = BigDecimalMath.MathContext;

// Java: BigDecimal.divide(divisor, MathContext.DECIMAL128)
function divideDecimal128(a: DecimalType, b: DecimalType): DecimalType
{
    if (b.isZero())
        throw new ArithmeticException(a.isZero() ? "Division undefined" : "Division by zero");
    // canonical: 0 divided by a negative number is -0 in decimal.js
    return canonical(a.div(b));
}

export class Logarithm extends FunctionDefinition
{
    public constructor()
    {
        super("math:log");
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new class extends ValueFunction2<DecimalType, DecimalType>
        {

            public override call2(x: DecimalType, base: DecimalType): Value
            {
                try
                {
                    const bd = Utility.toBigDecimal(x);
                    let r: DecimalType;
                    if (Utility.compareNumbers(base, new Decimal(10)) === 0)
                        r = BigDecimalMath.log10(bd, MathContext.DECIMAL128);
                    else if (Utility.compareNumbers(base, new Decimal(2)) === 0)
                        r = BigDecimalMath.log2(bd, MathContext.DECIMAL128);
                    else
                        r = divideDecimal128(BigDecimalMath.log(bd, MathContext.DECIMAL128), BigDecimalMath.log(Utility.toBigDecimal(base), MathContext.DECIMAL128));
                    return DataTypeUtility.value(r);
                }
                catch (e)
                {
                    if (!(e instanceof ArithmeticException))
                        throw e;
                    throw new UserException("Error while taking logarithm: " + e.message, e);
                }
            }
        }(ValueClass.NUMBER, ValueClass.NUMBER);
    }
}
