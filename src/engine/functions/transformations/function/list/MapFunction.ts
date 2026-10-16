// Port of xyz.columnal.transformations.function.list.MapFunction (functions module).
import { ValueClass } from "../../../../types/data/datatype/DataType.js";
import { ListExList, type ListEx } from "../../../../utility/utility/Utility.js";
import { ValueFunction2 } from "../ValueFunction2.js";
import { ValueFunction } from "../../../../expressions/transformations/expression/function/ValueFunction.js";
import type { DataType } from "../../../../types/data/datatype/DataType.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../types/data/unit/Unit.js";
import type { Either } from "../../../../utility-adt/utility/adt/Either.js";
import type { Value } from "../../../../utility/utility/Value.js";
import { FunctionDefinition } from "../FunctionDefinition.js";

export class MapFunction extends FunctionDefinition
{
    public constructor()
    {
        super("listprocess:apply each");
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new class extends ValueFunction2<ListEx, ValueFunction>
        {
            public override call2(list: ListEx, f: ValueFunction): Value
            {
                const items: Value[] = [];
                for (let i = 0; i < list.size(); i++)
                {
                    const x = list.get(i);
                    items.push(f.call([x]));
                }

                return new ListExList(items);
            }
        }(ValueClass.LIST, ValueFunction.CLASS);
    }
}
