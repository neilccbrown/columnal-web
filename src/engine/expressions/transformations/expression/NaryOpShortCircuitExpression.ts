// Port of xyz.columnal.transformations.expression.NaryOpShortCircuitExpression (expressions module).
import type { EvaluateState } from "./EvaluateState.js";
import { type Expression, ImplicitLambdaArg, NaryOpExpression } from "./Expressions.js";

export abstract class NaryOpShortCircuitExpression extends NaryOpExpression
{
    public constructor(expressions: readonly Expression[])
    {
        super(expressions);
    }

    public override calculateValue(state: EvaluateState): Expression.ValueResult
    {
        if (this.expressions.some(e => e instanceof ImplicitLambdaArg))
        {
            return ImplicitLambdaArg.makeImplicitFunction(this, this.expressions, state, s => this.getValueNaryOp(s));
        }
        else
        {
            return this.getValueNaryOp(state);
        }
    }

    public abstract getValueNaryOp(state: EvaluateState): Expression.ValueResult;
}
