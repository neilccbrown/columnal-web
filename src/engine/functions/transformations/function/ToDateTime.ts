// Port of xyz.columnal.transformations.function.ToDateTime (functions module).
import type { FuncDocKey } from "../../../anns/Annotations.js";
import { ValueFunction } from "../../../expressions/transformations/expression/function/ValueFunction.js";
import { LocalDate, LocalDateTime, LocalTime, type TemporalAccessor as JsJodaTemporalAccessor } from "../../../java/time/JavaTime.js";
import type { TemporalAccessor } from "../../../java/time/TemporalAccessor.js";
import type { DataType } from "../../../types/data/datatype/DataType.js";
import { DateTimeInfo } from "../../../types/data/datatype/DateTimeInfo.js";
import type { TypeManager } from "../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../types/data/unit/Unit.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import type { Either } from "../../../utility-adt/utility/adt/Either.js";
import type { Value } from "../../../utility/utility/Value.js";
import { FunctionDefinition } from "./FunctionDefinition.js";
import { temporalArg, ToTemporalFunction } from "./ToTemporalFunction.js";

/**
 * Created by neil on 16/12/2016.
 */
export class ToDateTime extends ToTemporalFunction
{

    public static readonly DATETIME_FROM_DATETIMEZONED: FuncDocKey = "datetime:datetime from datetimezoned";

    public override getTemporalFunctions(_mgr: UnitManager): readonly FunctionDefinition[]
    {
        const r: FunctionDefinition[] = [];
        r.push(new ToTemporalFunction.FromTemporal(this, ToDateTime.DATETIME_FROM_DATETIMEZONED));
        r.push(new class extends FunctionDefinition
        {
            public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
            {
                return new ToDateTime.DateAndTimeInstance();
            }
        }("datetime:datetime from dt"));

        return r;
    }

    public override getResultType(): DateTimeInfo
    {
        return new DateTimeInfo(DateTimeInfo.DateTimeType.DATETIME);
    }

    public override fromTemporal(temporalAccessor: JsJodaTemporalAccessor): TemporalAccessor
    {
        return LocalDateTime.from(temporalAccessor) as unknown as TemporalAccessor;
    }
}

export namespace ToDateTime
{
    export class DateAndTimeInstance extends ValueFunction
    {
        public override _call(): Value
        {
            return LocalDateTime.of(temporalArg(this.arg(0), LocalDate), temporalArg(this.arg(1), LocalTime)) as unknown as TemporalAccessor;
        }
    }
}
