// Port of xyz.columnal.transformations.function.ToTime (functions module).
import type { FuncDocKey } from "../../../anns/Annotations.js";
import { ValueFunction } from "../../../expressions/transformations/expression/function/ValueFunction.js";
import { LocalTime, type TemporalAccessor as JsJodaTemporalAccessor } from "../../../java/time/JavaTime.js";
import type { TemporalAccessor } from "../../../java/time/TemporalAccessor.js";
import { ValueClass, type DataType } from "../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import { DateTimeInfo } from "../../../types/data/datatype/DateTimeInfo.js";
import type { TypeManager } from "../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../types/data/unit/Unit.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import type { Either } from "../../../utility-adt/utility/adt/Either.js";
import { Utility } from "../../../utility/utility/Utility.js";
import type { Value } from "../../../utility/utility/Value.js";
import { FunctionDefinition } from "./FunctionDefinition.js";
import { ToTemporalFunction } from "./ToTemporalFunction.js";

/**
 * Created by neil on 15/12/2016.
 */
export class ToTime extends ToTemporalFunction
{

    public static readonly TIME_FROM_DATETIME: FuncDocKey = "datetime:time from datetime";

    public override getTemporalFunctions(_mgr: UnitManager): readonly FunctionDefinition[]
    {
        const r: FunctionDefinition[] = [];
        r.push(new ToTemporalFunction.FromTemporal(this, ToTime.TIME_FROM_DATETIME));
        r.push(new ToTemporalFunction.FromTemporal(this, "datetime:time from datetimezoned"));
        r.push(new class extends FunctionDefinition
        {
            public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
            {
                return new ToTime.FromNumbers();
            }
        }("datetime:time from hms"));
        return r;
    }

    public override getResultType(): DateTimeInfo
    {
        return new DateTimeInfo(DateTimeInfo.DateTimeType.TIMEOFDAY);
    }

    public override fromTemporal(temporalAccessor: JsJodaTemporalAccessor): TemporalAccessor
    {
        return DataTypeUtility.valueTime(LocalTime.from(temporalAccessor));
    }
}

export namespace ToTime
{
    export class FromNumbers extends ValueFunction
    {
        public override _call(): Value
        {
            const hour = DataTypeUtility.requireInteger(this.arg(0));
            const minute = DataTypeUtility.requireInteger(this.arg(1));
            const second = this.arg(2, ValueClass.NUMBER);
            // PORT-NOTE: as in Java, LocalTime.of throws DateTimeException (not a UserException) for
            // an out-of-range hour, minute or second.
            // Java: getFracPart(second, 9).intValue(), of a BigInteger
            return DataTypeUtility.valueTime(LocalTime.of(hour, minute, DataTypeUtility.requireInteger(Utility.getIntegerPart(second)), Number(BigInt.asIntN(32, Utility.getFracPart(second, 9)))));
        }
    }
}
