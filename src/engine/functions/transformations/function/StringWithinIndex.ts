// Port of xyz.columnal.transformations.function.StringWithinIndex (functions module).
// Not in FunctionList: in Java it no longer extends FunctionDefinition.
import { ValueFunction } from "../../../expressions/transformations/expression/function/ValueFunction.js";
import { ValueClass, type DataType } from "../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import type { Value } from "../../../utility/utility/Value.js";
import { Decimal } from "../../../java/JavaBigDecimal.js";
import { javaListGet } from "../../../java/JavaCollections.js";
import { javaCodePointCount } from "../../../java/JavaString.js";
import { ListEx } from "../../../utility/utility/Utility.js";

export class StringWithinIndex //extends FunctionDefinition
{
    public constructor()
    {
        //super("text:positions within");
    }

    //@Override
    public getInstance(_paramTypes: (s: string) => DataType): ValueFunction
    {
        return new StringWithinIndex.Instance();
    }
}

export namespace StringWithinIndex
{
    export class Instance extends ValueFunction
    {

        public override _call(): Value
        {
            const big = this.arg(1, ValueClass.STRING);
            const small = this.arg(0, ValueClass.STRING);
            return DataTypeUtility.value(new class extends ListEx
            {
                private readonly charIndexes: number[] = [];
                private readonly codepointIndexes: number[] = [];

                public override size(): number
                {
                    while (this.calcNext())
                    {
                        // Processing is done in calcNext()
                    }
                    return this.charIndexes.length;
                }

                private calcNext(): boolean
                {
                    const nextChar = big.indexOf(small, this.charIndexes.length === 0 ? 0 : this.charIndexes[this.charIndexes.length - 1]! + 1);
                    if (nextChar === -1)
                        return false;

                    if (this.codepointIndexes.length === 0)
                        this.codepointIndexes.push(javaCodePointCount(big, 0, nextChar));
                    else
                        this.codepointIndexes.push(this.codepointIndexes[this.codepointIndexes.length - 1]! + javaCodePointCount(big, this.charIndexes[this.charIndexes.length - 1]!, nextChar));
                    this.charIndexes.push(nextChar);
                    return true;
                }

                public override get(index: number): Value
                {
                    // PORT-NOTE: bug fix.  Java's condition was index < codepointIndexes.size(),
                    // so it never calculated the item asked for.  (This function is not in use.)
                    while (index >= this.codepointIndexes.length && this.calcNext())
                    {
                        // Processing is done in calcNext()
                    }
                    return DataTypeUtility.value(new Decimal(javaListGet(this.codepointIndexes, index)));
                }
            }());
        }
    }
}
