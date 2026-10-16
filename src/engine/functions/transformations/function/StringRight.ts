// Port of xyz.columnal.transformations.function.StringRight (functions module).
// Not in FunctionList: in Java it no longer extends FunctionDefinition.
import { ValueFunction } from "../../../expressions/transformations/expression/function/ValueFunction.js";
import { ValueClass, type DataType } from "../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import type { Value } from "../../../utility/utility/Value.js";
import { IndexOutOfBoundsException } from "../../../java/JavaExceptions.js";
import { javaCodePointCount, javaOffsetByCodePoints } from "../../../java/JavaString.js";
import { UserException } from "../../../utility-error/error/UserException.js";

export class StringRight //extends FunctionDefinition
{
    public constructor()
    {
        //super("text:right");
    }

    //@Override
    public getInstance(_paramTypes: (s: string) => DataType): ValueFunction
    {
        return new StringRight.Instance();
    }
}

export namespace StringRight
{
    export class Instance extends ValueFunction
    {

        public override _call(): Value
        {
            const src = this.arg(0, ValueClass.STRING);
            const codePointCount = this.intArg(1);
            if (codePointCount < 0)
                throw new UserException("Invalid count when calling right function: " + codePointCount);
            try
            {
                const totalCodepoints = javaCodePointCount(src);
                return DataTypeUtility.value(src.substring(javaOffsetByCodePoints(src, 0, Math.max(0, totalCodepoints - codePointCount))));
            }
            catch (e)
            {
                if (!(e instanceof IndexOutOfBoundsException))
                    throw e;
                // Just return whole string:
                return src;
            }
        }
    }
}
