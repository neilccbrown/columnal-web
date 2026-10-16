// Port of xyz.columnal.transformations.function.StringLength (functions module).
import { ValueFunction } from "../../../expressions/transformations/expression/function/ValueFunction.js";
import { ValueClass, type DataType } from "../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import type { TypeManager } from "../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../types/data/unit/Unit.js";
import type { Either } from "../../../utility-adt/utility/adt/Either.js";
import type { Value } from "../../../utility/utility/Value.js";
import { Decimal } from "../../../java/JavaBigDecimal.js";
import { javaCodePointCount } from "../../../java/JavaString.js";
import { FunctionDefinition } from "./FunctionDefinition.js";

export class StringLength extends FunctionDefinition
{
    public constructor()
    {
        super("text:text length");
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new StringLength.Instance();
    }
}

export namespace StringLength
{
    export class Instance extends ValueFunction
    {

        public override _call(): Value
        {
            const str = this.arg(0, ValueClass.STRING);
            return DataTypeUtility.value(new Decimal(javaCodePointCount(str)));
        }
    }
}
