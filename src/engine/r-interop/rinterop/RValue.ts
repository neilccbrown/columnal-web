// Port of xyz.columnal.rinterop.RValue (r-interop module).
import type { RVisitor } from "./RVisitor.js";

/**
 * An RValue is effectively an algebraic data type, best understood by looking at RVisitor.
 */
export interface RValue
{
    visit<T>(visitor: RVisitor<T>): T;
}
