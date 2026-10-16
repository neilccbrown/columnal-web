// Port of xyz.columnal.transformations.function.text.StringJoin (functions module).
import { ValueClass } from "../../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../types/data/datatype/DataTypeUtility.js";
import { Utility } from "../../../../utility/utility/Utility.js";
import { ValueFunction } from "../../../../expressions/transformations/expression/function/ValueFunction.js";
import type { DataType } from "../../../../types/data/datatype/DataType.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../types/data/unit/Unit.js";
import type { Either } from "../../../../utility-adt/utility/adt/Either.js";
import type { Value } from "../../../../utility/utility/Value.js";
import { FunctionDefinition } from "../FunctionDefinition.js";

export class StringJoin extends FunctionDefinition
{
    public constructor()
    {
        super("text:join text");
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new StringJoin.Instance();
    }
}

export namespace StringJoin
{
    export class Instance extends ValueFunction
    {
        public override _call(): Value
        {
            const textList = this.arg(0, ValueClass.LIST);
            let b = "";
            for (let i = 0; i < textList.size(); i++)
            {
                b += Utility.cast(textList.get(i), String);
            }
            return DataTypeUtility.value(b);
        }
    }
}
