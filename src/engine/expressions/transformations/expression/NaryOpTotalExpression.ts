// Port of xyz.columnal.transformations.expression.NaryOpTotalExpression (expressions module).
import type { EvaluateState } from "./EvaluateState.js";
import { type Expression, ImplicitLambdaArg, NaryOpExpression } from "./Expressions.js";

/**
 * A subclass of {@link NaryOpExpression} for expressions that use
 * all their arguments for calculation every time (e.g.
 * times expression) as opposed to being able to short-circuit
 * (like in an and expression).
 */
export abstract class NaryOpTotalExpression extends NaryOpExpression
{
    public constructor(expressions: readonly Expression[])
    {
        super(expressions);
    }

    public override calculateValue(state: EvaluateState): Expression.ValueResult
    {
        if (this.expressions.some(e => e instanceof ImplicitLambdaArg))
        {
            return ImplicitLambdaArg.makeImplicitFunction(this, this.expressions, state, s => {
                const expressionValues: Expression.ValueResult[] = [];
                for (const expression of this.expressions)
                {
                    this.fetchSubExpression(expression, s, expressionValues);
                }
                return this.getValueNaryOp([...expressionValues], s);
            });
        }
        else
        {
            const expressionValues: Expression.ValueResult[] = [];
            for (const expression of this.expressions)
            {
                this.fetchSubExpression(expression, state, expressionValues);
            }
            return this.getValueNaryOp([...expressionValues], state);
        }
    }

    public abstract getValueNaryOp(expressionValues: readonly Expression.ValueResult[], state: EvaluateState): Expression.ValueResult;
}
