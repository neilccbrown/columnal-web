// Port of xyz.columnal.transformations.function.StringWithin (functions module).
// Not in FunctionList: in Java it no longer extends FunctionDefinition.
import { ValueFunction } from "../../../expressions/transformations/expression/function/ValueFunction.js";
import { ValueClass, type DataType } from "../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import type { Value } from "../../../utility/utility/Value.js";

export class StringWithin //extends FunctionDefinition
{
    public constructor()
    {
        //super("text:within");
    }

    //@Override
    public getInstance(_paramTypes: (s: string) => DataType): ValueFunction
    {
        return new StringWithin.Instance();
    }
}

export namespace StringWithin
{
    export class Instance extends ValueFunction
    {
        public override _call(): Value
        {
            return DataTypeUtility.value(this.arg(1, ValueClass.STRING).includes(this.arg(0, ValueClass.STRING)));
        }
    }
}
