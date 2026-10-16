// Port of xyz.columnal.transformations.function.StringMid (functions module).
// Not in FunctionList: in Java it no longer extends FunctionDefinition.
import { ValueFunction } from "../../../expressions/transformations/expression/function/ValueFunction.js";
import { ValueClass, type DataType } from "../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import type { Value } from "../../../utility/utility/Value.js";
import { IndexOutOfBoundsException } from "../../../java/JavaExceptions.js";
import { javaOffsetByCodePoints } from "../../../java/JavaString.js";
import { UserException } from "../../../utility-error/error/UserException.js";

export class StringMid //extends FunctionDefinition
{
    public constructor()
    {
        //super("text:middle");
    }

    //@Override
    public getInstance(_paramTypes: (s: string) => DataType): ValueFunction
    {
        return new StringMid.Instance();
    }
}

export namespace StringMid
{
    export class Instance extends ValueFunction
    {
        public override _call(): Value
        {
            const src = this.arg(0, ValueClass.STRING);
            const codePointStart = this.intArg(1);
            if (codePointStart <= 0)
                throw new UserException("Invalid count when calling middle function: " + codePointStart);
            const codePointCount = this.intArg(2);
            if (codePointCount < 0)
                throw new UserException("Invalid count when calling middle function: " + codePointCount);
            let startIndex: number;
            try
            {
                // Start is one-based, so subtract one:
                startIndex = javaOffsetByCodePoints(src, 0, codePointStart - 1);
            }
            catch (e)
            {
                if (!(e instanceof IndexOutOfBoundsException))
                    throw e;
                // Searching for start index failed, so just return empty string:
                return DataTypeUtility.value("");
            }
            try
            {
                return DataTypeUtility.value(src.substring(startIndex, javaOffsetByCodePoints(src, startIndex, codePointCount)));
            }
            catch (e)
            {
                if (!(e instanceof IndexOutOfBoundsException))
                    throw e;
                // Failed to find end, just return all chars from startIndex:
                return DataTypeUtility.value(src.substring(startIndex));
            }
        }
    }
}
