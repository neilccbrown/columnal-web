// Port of xyz.columnal.transformations.function.StringTrim (functions module).
import { ValueFunction } from "../../../expressions/transformations/expression/function/ValueFunction.js";
import { ValueClass, type DataType } from "../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import type { TypeManager } from "../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../types/data/unit/Unit.js";
import type { Either } from "../../../utility-adt/utility/adt/Either.js";
import type { Value } from "../../../utility/utility/Value.js";
import { FunctionDefinition } from "./FunctionDefinition.js";

export class StringTrim extends FunctionDefinition
{
    public constructor()
    {
        super("text:trim");
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new StringTrim.Instance();
    }
}

export namespace StringTrim
{
    export class Instance extends ValueFunction
    {

        public override _call(): Value
        {
            const src = this.arg(0, ValueClass.STRING);
            // Java: Guava's CharMatcher.whitespace().trimFrom(src).  Guava's whitespace is
            // exactly Unicode's White_Space property.
            const trimmed = src.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, "");
            return DataTypeUtility.value(trimmed);
        }
    }
}
