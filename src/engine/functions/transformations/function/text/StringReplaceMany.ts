// Port of xyz.columnal.transformations.function.text.StringReplaceMany (functions module).
import { ValueClass } from "../../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../types/data/datatype/DataTypeUtility.js";
import { Record, Utility } from "../../../../utility/utility/Utility.js";
import { ValueFunction } from "../../../../expressions/transformations/expression/function/ValueFunction.js";
import type { DataType } from "../../../../types/data/datatype/DataType.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../types/data/unit/Unit.js";
import type { Either } from "../../../../utility-adt/utility/adt/Either.js";
import type { Value } from "../../../../utility/utility/Value.js";
import { FunctionDefinition } from "../FunctionDefinition.js";

export class StringReplaceMany extends FunctionDefinition
{
    public constructor()
    {
        super("text:replace many");
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new StringReplaceMany.Instance();
    }
}

export namespace StringReplaceMany
{
    export class Instance extends ValueFunction
    {
        public override _call(): Value
        {
            const replacements = this.arg(0, ValueClass.LIST);
            const whole = this.arg(1, ValueClass.STRING);
            const finds: string[] = new Array<string>(replacements.size());
            const replaces: string[] = new Array<string>(finds.length);
            for (let i = 0; i < finds.length; i++)
            {
                const record = Utility.cast(replacements.get(i), Record);
                finds[i] = Utility.cast(record.getField("find"), String);
                replaces[i] = Utility.cast(record.getField("replace"), String);
            }
            // Quite naive implementation, could be sped up:
            let stringBuilder = "";
            let beginSegment = 0;
            let charIndex = 0;
            nextChar: while (charIndex < whole.length)
            {
                for (let findIndex = 0; findIndex < finds.length; findIndex++)
                {
                    const find = finds[findIndex]!;
                    if (whole.startsWith(find, charIndex))
                    {
                        if (beginSegment < charIndex)
                        {
                            stringBuilder += whole.substring(beginSegment, charIndex);
                        }
                        stringBuilder += replaces[findIndex]!;
                        charIndex += find.length;
                        beginSegment = charIndex;
                        continue nextChar;
                    }
                }
                charIndex++;
            }
            if (beginSegment === 0) // Replaced nothing, return original
                return whole;
            else
                return DataTypeUtility.value(stringBuilder + whole.substring(beginSegment, charIndex));
        }
    }
}
