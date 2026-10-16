// Port of xyz.columnal.transformations.function.list.GetElement (functions module).
import { Decimal } from "../../../../java/JavaBigDecimal.js";
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

/**
 * Created by neil on 17/01/2017.
 */
export class GetElement extends FunctionDefinition
{
    public static readonly NAME = "element";

    // Takes parameters: column/array, index
    public constructor()
    {
        super("list:element");
    }

    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new GetElement.Instance();
    }
}

export namespace GetElement
{
    export class Instance extends ValueFunction
    {
        public override _call(): Value
        {
            const oneBasedIndex = this.intArg(1);
            const userIndex = DataTypeUtility.userIndex(new Decimal(oneBasedIndex));
            this.addUsedLocations(locs => {
                const resultLoc = locs[0]!.getListElementLocation(oneBasedIndex - 1);
                if (resultLoc !== null)
                    this.setResultIsLocation(resultLoc);
                return Utility.streamNullable(resultLoc);
            });
            return Utility.getAtIndex(this.arg(0, ValueClass.LIST), userIndex);
        }
    }
}
