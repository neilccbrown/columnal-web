// Port of xyz.columnal.transformations.function.ToYearMonth (functions module).
import type { FuncDocKey } from "../../../anns/Annotations.js";
import { ValueFunction } from "../../../expressions/transformations/expression/function/ValueFunction.js";
import { isDateTimeException, javaMessage, YearMonth, type TemporalAccessor as JsJodaTemporalAccessor } from "../../../java/time/JavaTime.js";
import { UserException } from "../../../utility-error/error/UserException.js";
import type { TemporalAccessor } from "../../../java/time/TemporalAccessor.js";
import type { DataType } from "../../../types/data/datatype/DataType.js";
import { DateTimeInfo } from "../../../types/data/datatype/DateTimeInfo.js";
import type { TypeManager } from "../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../types/data/unit/Unit.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import type { Either } from "../../../utility-adt/utility/adt/Either.js";
import type { Value } from "../../../utility/utility/Value.js";
import { FunctionDefinition } from "./FunctionDefinition.js";
import { ToTemporalFunction } from "./ToTemporalFunction.js";

/**
 * Created by neil on 16/12/2016.
 */
export class ToYearMonth extends ToTemporalFunction
{

    public static readonly DATEYM_FROM_DATE: FuncDocKey = "datetime:dateym from date";

    public override getTemporalFunctions(_mgr: UnitManager): readonly FunctionDefinition[]
    {
        const r: FunctionDefinition[] = [];
        r.push(new ToTemporalFunction.FromTemporal(this, ToYearMonth.DATEYM_FROM_DATE));
        r.push(new class extends FunctionDefinition
        {
            public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
            {
                return new ToYearMonth.FromNumbers();
            }
        }("datetime:dateym from ym"));
        return r;
    }

    public override getResultType(): DateTimeInfo
    {
        return new DateTimeInfo(DateTimeInfo.DateTimeType.YEARMONTH);
    }


    public override fromTemporal(temporalAccessor: JsJodaTemporalAccessor): TemporalAccessor
    {
        return YearMonth.from(temporalAccessor) as unknown as TemporalAccessor;
    }
}

export namespace ToYearMonth
{
    export class FromNumbers extends ValueFunction
    {
        public override _call(): Value
        {
            const year = this.intArg(0);
            const month = this.intArg(1);
            try
            {
                return YearMonth.of(year, month) as unknown as TemporalAccessor;
            }
            catch (e)
            {
                // PORT-NOTE: bug fix.  Java let the DateTimeException through (a crash rather than
                // an error for the user) for an out-of-range year or month.
                if (!isDateTimeException(e))
                    throw e;
                throw new UserException("Invalid year and month: " + year + ", " + month + " " + javaMessage(e), e);
            }
        }
    }
}
