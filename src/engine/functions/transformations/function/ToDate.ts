// Port of xyz.columnal.transformations.function.ToDate (functions module).
import type { FuncDocKey } from "../../../anns/Annotations.js";
import { ValueFunction } from "../../../expressions/transformations/expression/function/ValueFunction.js";
import { isDateTimeException, javaMessage, LocalDate, type TemporalAccessor as JsJodaTemporalAccessor, type YearMonth } from "../../../java/time/JavaTime.js";
import type { TemporalAccessor } from "../../../java/time/TemporalAccessor.js";
import { ValueClass, type DataType } from "../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import { DateTimeInfo } from "../../../types/data/datatype/DateTimeInfo.js";
import type { TypeManager } from "../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../types/data/unit/Unit.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import type { Either } from "../../../utility-adt/utility/adt/Either.js";
import { UserException } from "../../../utility-error/error/UserException.js";
import type { Value } from "../../../utility/utility/Value.js";
import { FunctionDefinition } from "./FunctionDefinition.js";
import { ToTemporalFunction } from "./ToTemporalFunction.js";

/**
 * Created by neil on 14/12/2016.
 */
export class ToDate extends ToTemporalFunction
{


    public static readonly DATE_FROM_DATETIME: FuncDocKey = "datetime:date from datetime";

    public override getTemporalFunctions(_mgr: UnitManager): readonly FunctionDefinition[]
    {
        const r: FunctionDefinition[] = [];
        r.push(new ToTemporalFunction.FromTemporal(this, ToDate.DATE_FROM_DATETIME));
        r.push(new ToTemporalFunction.FromTemporal(this, "datetime:date from datetimezoned"));
        r.push(new class extends FunctionDefinition
        {
            public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
            {
                return new ToDate.FromNumbers();
            }
        }("datetime:date from ymd"));
        return r;
    }

    public override getResultType(): DateTimeInfo
    {
        return new DateTimeInfo(DateTimeInfo.DateTimeType.YEARMONTHDAY);
    }

    public override fromTemporal(temporalAccessor: JsJodaTemporalAccessor): TemporalAccessor
    {
        return DataTypeUtility.valueDate(LocalDate.from(temporalAccessor));
    }
}

export namespace ToDate
{
    export class FromYearMonth_Day extends ValueFunction
    {
        public override _call(): Value
        {
            // Java: arg(0, YearMonth.class)
            const ym = this.arg(0, ValueClass.TEMPORAL) as unknown as YearMonth;
            const day = this.intArg(1);
            try
            {
                return DataTypeUtility.valueDate(LocalDate.of(ym.year(), ym.month(), day));
            }
            catch (e)
            {
                if (!isDateTimeException(e))
                    throw e;
                throw new UserException("Invalid date: " + ym.year() + ", " + ym.month().name() + ", " + day + " " + javaMessage(e), e);
            }
        }
    }

    export class FromNumbers extends ValueFunction
    {
        public override _call(): Value
        {
            const year = this.intArg(0);
            const month = this.intArg(1);
            const day = this.intArg(2);
            try
            {
                return DataTypeUtility.valueDate(LocalDate.of(year, month, day));
            }
            catch (e)
            {
                if (!isDateTimeException(e))
                    throw e;
                throw new UserException("Invalid date: " + year + ", " + month + ", " + day + " " + javaMessage(e), e);
            }
        }
    }
}
