// Port of xyz.columnal.transformations.function.text.StringReplace (functions module).
import { javaReplace } from "../../../../java/JavaString.js";
import { ValueClass } from "../../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../types/data/datatype/DataTypeUtility.js";
import { ValueFunction } from "../../../../expressions/transformations/expression/function/ValueFunction.js";
import type { DataType } from "../../../../types/data/datatype/DataType.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../types/data/unit/Unit.js";
import type { Either } from "../../../../utility-adt/utility/adt/Either.js";
import type { Value } from "../../../../utility/utility/Value.js";
import { FunctionDefinition } from "../FunctionDefinition.js";

export class StringReplace extends FunctionDefinition
{
    public constructor()
    {
        super("text:replace");
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new StringReplace.Instance();
    }
}

export namespace StringReplace
{
    export class Instance extends ValueFunction
    {
        public override _call(): Value
        {
            const target = this.arg(0, ValueClass.STRING);
            const whole = this.arg(2, ValueClass.STRING);
            // Java does act on replacing empty string, but we don't:
            if (target.length === 0)
                return whole;
            return DataTypeUtility.value(javaReplace(whole, target, this.arg(1, ValueClass.STRING)));
        }
    }
}
