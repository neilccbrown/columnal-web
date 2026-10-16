// Port of xyz.columnal.transformations.function.StringLeft (functions module).
// Not in FunctionList: in Java it no longer extends FunctionDefinition.
import { ValueFunction } from "../../../expressions/transformations/expression/function/ValueFunction.js";
import { ValueClass, type DataType } from "../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import type { Value } from "../../../utility/utility/Value.js";
import { IndexOutOfBoundsException } from "../../../java/JavaExceptions.js";
import { javaOffsetByCodePoints } from "../../../java/JavaString.js";
import { UserException } from "../../../utility-error/error/UserException.js";

export class StringLeft //extends FunctionDefinition
{
    public constructor()
    {
        //super("text:left");
    }

    //@Override
    public getInstance(_paramTypes: (s: string) => DataType): ValueFunction
    {
        return new StringLeft.Instance();
    }
}

export namespace StringLeft
{
    export class Instance extends ValueFunction
    {

        public override _call(): Value
        {
            const src = this.arg(0, ValueClass.STRING);
            const codePointCount = this.intArg(1);
            if (codePointCount < 0)
                throw new UserException("Invalid count when calling left function: " + codePointCount);
            try
            {
                return DataTypeUtility.value(src.substring(0, javaOffsetByCodePoints(src, 0, codePointCount)));
            }
            catch (e)
            {
                if (!(e instanceof IndexOutOfBoundsException))
                    throw e;
                // Just return whole string:
                return DataTypeUtility.value(src);
            }
        }
    }
}
