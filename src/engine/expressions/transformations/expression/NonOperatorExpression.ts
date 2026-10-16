// Port of xyz.columnal.transformations.expression.NonOperatorExpression (expressions module).
import { Expression } from "./Expressions.js";

/**
 * Any expression which does not load directly into a consecutive, and if needed,
 * will appear in a consecutive as a single item.
 */
export abstract class NonOperatorExpression extends Expression
{
}
