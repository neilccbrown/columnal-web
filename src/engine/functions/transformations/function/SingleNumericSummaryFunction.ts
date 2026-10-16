// Port of xyz.columnal.transformations.function.SingleNumericSummaryFunction (functions module).
import type { FuncDocKey } from "../../../anns/Annotations.js";
import { FunctionDefinition } from "./FunctionDefinition.js";

/**
 * Base class for functions which take a single array of a numeric type
 * (possibly with units) and return a single value of that same type (incl. any units)
 */
export abstract class SingleNumericSummaryFunction extends FunctionDefinition
{
    public constructor(funcDocKey: FuncDocKey)
    {
        super(funcDocKey);
    }
}
