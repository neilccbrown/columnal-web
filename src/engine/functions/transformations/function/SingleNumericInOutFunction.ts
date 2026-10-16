// Port of xyz.columnal.transformations.function.SingleNumericInOutFunction (functions module).
import type { FuncDocKey } from "../../../anns/Annotations.js";
import { FunctionDefinition } from "./FunctionDefinition.js";

/**
 * Base class for functions which take a single numeric input,
 * and give an output of the same type, with matching units.
 *
 * package-visible
 */
export abstract class SingleNumericInOutFunction extends FunctionDefinition
{
    public constructor(funcDocKey: FuncDocKey)
    {
        super(funcDocKey);
    }
}
