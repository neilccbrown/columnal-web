// Port of xyz.columnal.transformations.expression.function.FunctionLookup (expressions module).
import type { StandardFunctionDefinition } from "./StandardFunctionDefinition.js";

export interface FunctionLookup
{
    /**
     * Name can be unscoped, or scoped with backslashes
     */
    lookup(functionName: string): StandardFunctionDefinition | null;

    getAllFunctions(): readonly StandardFunctionDefinition[];
}
