// Port of xyz.columnal.transformations.function.ValueFunction2 (functions module).
import { ValueFunction } from "../../../expressions/transformations/expression/function/ValueFunction.js";
import type { ValueClass } from "../../../types/data/datatype/DataType.js";
import type { Value } from "../../../utility/utility/Value.js";

/**
 * A helper extension for ValueFunction which does the casting
 * for you.
 */
export abstract class ValueFunction2<A extends Value, B extends Value> extends ValueFunction
{
    private readonly classA: ValueClass<A>;
    private readonly classB: ValueClass<B>;

    public constructor(classA: ValueClass<A>, classB: ValueClass<B>)
    {
        super();
        this.classA = classA;
        this.classB = classB;
    }

    public override _call(): Value
    {
        return this.call2(this.arg(0, this.classA), this.arg(1, this.classB));
    }

    public abstract call2(a: A, b: B): Value;
}
