// Port of xyz.columnal.transformations.function.datetime.YearsBetween (functions module).
import { Decimal } from "../../../../java/JavaBigDecimal.js";
import { ChronoField, ChronoUnit, isDateTimeException, javaMessage, LocalDate, type Temporal } from "../../../../java/time/JavaTime.js";
import { UserException } from "../../../../utility-error/error/UserException.js";
import { ValueClass } from "../../../../types/data/datatype/DataType.js";
import { ValueFunction } from "../../../../expressions/transformations/expression/function/ValueFunction.js";
import type { DataType } from "../../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../types/data/datatype/DataTypeUtility.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../types/data/unit/Unit.js";
import type { Either } from "../../../../utility-adt/utility/adt/Either.js";
import type { Value } from "../../../../utility/utility/Value.js";
import { FunctionDefinition } from "../FunctionDefinition.js";

export class YearsBetween extends FunctionDefinition
{
    public constructor()
    {
        super("datetime:years between");
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
                const wholeYears = ChronoUnit.YEARS.between(lhs, rhs);
                let lhsMDInRhsYear: LocalDate;
                let lhsMDInRhsYearPlusOne: LocalDate;
                try
                {
                    lhsMDInRhsYear = LocalDate.of(rhs.get(ChronoField.YEAR), lhs.get(ChronoField.MONTH_OF_YEAR), lhs.get(ChronoField.DAY_OF_MONTH));
                    lhsMDInRhsYearPlusOne = LocalDate.of(rhs.get(ChronoField.YEAR) + 1, lhs.get(ChronoField.MONTH_OF_YEAR), lhs.get(ChronoField.DAY_OF_MONTH));
                }
                catch (e)
                {
                    // PORT-NOTE: bug fix.  Java let the DateTimeException through (a crash rather
                    // than an error for the user), when lhs is 29 February and rhs's year, or the
                    // year after, is not a leap year.
                    if (!isDateTimeException(e))
                        throw e;
                    throw new UserException("Cannot calculate years between " + lhs.toString() + " and " + rhs.toString() + ": " + javaMessage(e), e);
                }
                const daysBetween = ChronoUnit.DAYS.between(lhsMDInRhsYear, rhs);
                const daysThatYear = ChronoUnit.DAYS.between(lhsMDInRhsYear, lhsMDInRhsYearPlusOne);
                const r = new Decimal(daysBetween).div(new Decimal(daysThatYear)).plus(new Decimal(wholeYears));
                return DataTypeUtility.value(r);
            }
        }();
    }
}
