// Port of xyz.columnal.transformations.function.text.StringSplit (functions module).
import { ValueClass } from "../../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../types/data/datatype/DataTypeUtility.js";
import { UserException } from "../../../../utility-error/error/UserException.js";
import { ListEx } from "../../../../utility/utility/Utility.js";
import { ValueFunction2 } from "../ValueFunction2.js";
import type { ValueFunction } from "../../../../expressions/transformations/expression/function/ValueFunction.js";
import type { DataType } from "../../../../types/data/datatype/DataType.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../types/data/unit/Unit.js";
import type { Either } from "../../../../utility-adt/utility/adt/Either.js";
import type { Value } from "../../../../utility/utility/Value.js";
import { FunctionDefinition } from "../FunctionDefinition.js";

export class StringSplit extends FunctionDefinition
{
    public constructor()
    {
        super("text:split text");
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new class extends ValueFunction2<string, string>
        {

            public override call2(text: string, separator: string): Value
            {
                let split: string[];
                if (separator.length === 0)
                    // Java: text.codePoints() mapped to strings; an unpaired surrogate is its own item
                    split = Array.from(text);
                else
                    // Java: text.split(Pattern.quote(separator), -1), which keeps trailing empty strings
                    split = text.split(separator);
                return DataTypeUtility.value(new class extends ListEx
                {

                    public override size(): number
                    {
                        return split.length;
                    }

                    public override get(index: number): Value
                    {
                        if (index < 0 || index >= split.length)
                            throw new UserException("Invalid list index: " + index);
                        return DataTypeUtility.value(split[index]!);
                    }
                }());
            }
        }(ValueClass.STRING, ValueClass.STRING);
    }
}
