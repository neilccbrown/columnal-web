// Port of xyz.columnal.transformations.function.datetime.AddDays (functions module).
import { longValue, toJavaString } from "../../../../java/JavaBigDecimal.js";
import { ArithmeticException as JodaArithmeticException, ChronoUnit, isDateTimeException, type Temporal } from "../../../../java/time/JavaTime.js";
import { ValueClass } from "../../../../types/data/datatype/DataType.js";
import { DateTimeInfo } from "../../../../types/data/datatype/DateTimeInfo.js";
import { InternalException } from "../../../../utility-error/error/InternalException.js";
import { UserException } from "../../../../utility-error/error/UserException.js";
import { Utility } from "../../../../utility/utility/Utility.js";
import { ValueFunction } from "../../../../expressions/transformations/expression/function/ValueFunction.js";
import type { DataType } from "../../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../types/data/datatype/DataTypeUtility.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../types/data/unit/Unit.js";
import type { Either } from "../../../../utility-adt/utility/adt/Either.js";
import type { Value } from "../../../../utility/utility/Value.js";
import { FunctionDefinition } from "../FunctionDefinition.js";

export class AddDays extends FunctionDefinition
{
    public constructor()
    {
        super("datetime:add days");
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new class extends ValueFunction
        {
            public override _call(): Value
            {
                // Java: arg(0, Temporal.class)
                const lhs = this.arg(0, ValueClass.TEMPORAL) as unknown as Temporal;
                const rhs = this.arg(1, ValueClass.NUMBER);
                if (!Utility.isIntegral(rhs))
                    throw new UserException("Cannot add " + toJavaString(rhs) + " days; number must be an integer (whole number)");
                try
                {
                    const value = DataTypeUtility.value(new DateTimeInfo(DateTimeInfo.DateTimeType.YEARMONTHDAY), lhs.plus(Number(longValue(rhs)), ChronoUnit.DAYS));
                    if (value !== null)
                        return value;
                    else
                        throw new InternalException("Internal rrror adding " + longValue(rhs).toString() + " days to " + lhs.toString());
                }
                catch (e)
                {
                    if (!(e instanceof JodaArithmeticException || isDateTimeException(e)))
                        throw e;
                    throw new UserException("Overflow while trying to add " + longValue(rhs).toString() + " days to " + lhs.toString());
                }
            }
        }();
    }
}
