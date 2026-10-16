// Port of xyz.columnal.transformations.function.ToDateTimeZone (functions module).
import { ValueFunction } from "../../../expressions/transformations/expression/function/ValueFunction.js";
import { LocalDate, LocalDateTime, LocalTime, ZonedDateTime, ZoneId, type TemporalAccessor as JsJodaTemporalAccessor } from "../../../java/time/JavaTime.js";
import type { TemporalAccessor } from "../../../java/time/TemporalAccessor.js";
import { ValueClass, type DataType } from "../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
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
export class ToDateTimeZone extends ToTemporalFunction
{
    public override getTemporalFunctions(_mgr: UnitManager): readonly FunctionDefinition[]
    {
        const r: FunctionDefinition[] = [];
        //r.add(fromString("datetimezoned from string"));
        r.push(new class extends FunctionDefinition
        {
            public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
            {
                return new ToDateTimeZone.D_T_Z();
            }
        }("datetime:datetimezoned from dtz"));
        return r;
    }

    public override getResultType(): DateTimeInfo
    {
        return new DateTimeInfo(DateTimeInfo.DateTimeType.DATETIMEZONED);
    }

    public override fromTemporal(temporalAccessor: JsJodaTemporalAccessor): TemporalAccessor
    {
        return DataTypeUtility.valueZonedDateTime(ZonedDateTime.from(temporalAccessor));
    }
}

export namespace ToDateTimeZone
{
    export class D_T_Z extends ValueFunction
    {
        public override _call(): Value
        {
            // PORT-NOTE: as in Java, ZoneId.of throws (not a UserException) for an unknown zone.
            return DataTypeUtility.valueZonedDateTime(ZonedDateTime.of(LocalDateTime.of(temporalArg(this.arg(0), LocalDate), temporalArg(this.arg(1), LocalTime)), ZoneId.of(this.arg(2, ValueClass.STRING))));
        }
    }
}
