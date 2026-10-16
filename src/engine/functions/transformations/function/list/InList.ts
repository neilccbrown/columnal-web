// Port of xyz.columnal.transformations.function.list.InList (functions module).
import type { FuncDocKey } from "../../../../anns/Annotations.js";
import { DataTypeUtility } from "../../../../types/data/datatype/DataTypeUtility.js";
import { ListEx, Utility } from "../../../../utility/utility/Utility.js";
import { ValueFunction } from "../../../../expressions/transformations/expression/function/ValueFunction.js";
import type { DataType } from "../../../../types/data/datatype/DataType.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../types/data/unit/Unit.js";
import type { Either } from "../../../../utility-adt/utility/adt/Either.js";
import type { Value } from "../../../../utility/utility/Value.js";
import { FunctionDefinition } from "../FunctionDefinition.js";

export class InList extends FunctionDefinition
{
    public static readonly NAME: FuncDocKey = "listprocess:list contains";

    public constructor()
    {
        super(InList.NAME);
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new InList.Instance();
    }
}

export namespace InList
{
    export class Instance extends ValueFunction
    {
        public override _call(): Value
        {
            const list = Utility.cast(this.arg(0), ListEx);
            const target = this.arg(1);
            for (let i = 0; i < list.size(); i++)
            {
                if (Utility.compareValues(list.get(i), target) === 0)
                    return DataTypeUtility.value(true);
            }
            return DataTypeUtility.value(false);
        }
    }
}
