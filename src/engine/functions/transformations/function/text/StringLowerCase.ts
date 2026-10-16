// Port of xyz.columnal.transformations.function.text.StringLowerCase (functions module).
import type { FuncDocKey } from "../../../../anns/Annotations.js";
import { ValueClass } from "../../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../types/data/datatype/DataTypeUtility.js";
import { ValueFunction1 } from "../ValueFunction1.js";
import type { ValueFunction } from "../../../../expressions/transformations/expression/function/ValueFunction.js";
import type { DataType } from "../../../../types/data/datatype/DataType.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../types/data/unit/Unit.js";
import type { Either } from "../../../../utility-adt/utility/adt/Either.js";
import type { Value } from "../../../../utility/utility/Value.js";
import { FunctionDefinition } from "../FunctionDefinition.js";

export class StringLowerCase extends FunctionDefinition
{

    public static readonly NAME: FuncDocKey = "text:lower case";

    public constructor()
    {
        super(StringLowerCase.NAME);
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new class extends ValueFunction1<string>
        {

            public override call1(s: string): Value
            {
                // Java: s.toLowerCase(Locale.ENGLISH), which has no language-specific rules
                return DataTypeUtility.value(s.toLowerCase());
            }
        }(ValueClass.STRING);
    }
}
