// Port of xyz.columnal.transformations.function.ValueFunction1 (functions module).
import { ValueFunction } from "../../../expressions/transformations/expression/function/ValueFunction.js";
import type { ValueClass } from "../../../types/data/datatype/DataType.js";
import type { Value } from "../../../utility/utility/Value.js";

/**
 * A helper extension for ValueFunction which does the casting
 * for you.
 */
export abstract class ValueFunction1<A extends Value> extends ValueFunction
{
    private readonly classA: ValueClass<A>;

    public constructor(classA: ValueClass<A>)
    {
        super();
        this.classA = classA;
    }

    public override _call(): Value
    {
        return this.call1(this.arg(0, this.classA));
    }

    public abstract call1(a: A): Value;
}
