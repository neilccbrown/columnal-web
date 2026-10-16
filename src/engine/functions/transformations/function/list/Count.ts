// Port of xyz.columnal.transformations.function.list.Count (functions module).
import { Decimal } from "../../../../java/JavaBigDecimal.js";
import { ValueClass } from "../../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../types/data/datatype/DataTypeUtility.js";
import { ValueFunction } from "../../../../expressions/transformations/expression/function/ValueFunction.js";
import type { DataType } from "../../../../types/data/datatype/DataType.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../types/data/unit/Unit.js";
import type { Either } from "../../../../utility-adt/utility/adt/Either.js";
import type { Value } from "../../../../utility/utility/Value.js";
import { FunctionDefinition } from "../FunctionDefinition.js";

/**
 * Created by neil on 14/01/2017.
 */
export class Count extends FunctionDefinition
{
    public constructor()
    {
        super("list:list length");
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new Count.Instance();
    }
}

export namespace Count
{
    export class Instance extends ValueFunction
    {
        public override _call(): Value
        {
            return DataTypeUtility.value(new Decimal(this.arg(0, ValueClass.LIST).size()));
        }
    }
}
