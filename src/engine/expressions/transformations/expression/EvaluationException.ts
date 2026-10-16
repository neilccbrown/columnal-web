// Port of xyz.columnal.transformations.expression.EvaluationException (expressions module).
import { UserException } from "../../../utility-error/error/UserException.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import { Utility } from "../../../utility/utility/Utility.js";
import type { EvaluateState } from "./EvaluateState.js";
import type { Expression } from "./Expressions.js";
import { Explanation, type ReadonlySetLike } from "./explanation/Explanation.js";
import type { ExplanationLocation } from "./explanation/ExplanationLocation.js";

class StackEntry
{
    public readonly expression: Expression;
    public readonly subValues: readonly Expression.ValueResult[];
    public readonly executionType: Explanation.ExecutionType;
    public readonly evaluateState: EvaluateState;

    public constructor(expression: Expression, subValues: readonly Expression.ValueResult[], executionType: Explanation.ExecutionType, evaluateState: EvaluateState)
    {
        this.expression = expression;
        this.subValues = subValues;
        this.executionType = executionType;
        this.evaluateState = evaluateState;
    }
}

/**
 * An exception which can produce a stack trace in terms of our own Expression items.
 */
export class EvaluationException extends UserException
{
    // Originator (top of call stack) first, outermost call is last.  Will never be empty:
    // PORT-NOTE: Java's field is "stack", which would clash with Error.stack.
    private readonly expressionStack: readonly StackEntry[];

    // If e is an EvaluationException this is a chained catch.
    // Otherwise this is top of a new stack
    public constructor(e: UserException, expression: Expression, executionType: Explanation.ExecutionType, evaluateState: EvaluateState, subItems: readonly Expression.ValueResult[])
    {
        super(e.getStyledMessage());
        const entry = new StackEntry(expression, subItems, executionType, evaluateState);
        if (e instanceof EvaluationException)
        {
            this.expressionStack = Utility.appendToList(e.expressionStack, entry);
        }
        else
        {
            this.expressionStack = [entry];
        }
    }

    // Java: makeExplanation() and private makeExplanation(int stackLevel)
    public makeExplanation(stackLevel: number = this.expressionStack.length - 1): Explanation
    {
        const cur = this.expressionStack[stackLevel]!;
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- the inner class's outer instance
        const outer = this;
        return new class extends Explanation
        {
            public override describe(_alreadyDescribed: ReadonlySetLike<Explanation>, _hyperlinkLocation: (location: ExplanationLocation) => StyledString, _expressionStyler: Expression.ExpressionStyler, _extraLocations: readonly ExplanationLocation[], _skipIfTrivial: boolean): StyledString | null
            {
                if (stackLevel === 0)
                    return StyledString.concat(outer.getStyledMessage(), StyledString.s(" in: "), cur.expression.toStyledString());
                else
                    return StyledString.concat(StyledString.s("In: "), cur.expression.toStyledString());
            }

            public override getDirectSubExplanations(): readonly Explanation[]
            {
                const successful = Utility.mapListInt(cur.subValues, r => r.makeExplanation(null));
                return stackLevel === 0 ? successful : Utility.appendToList(successful, outer.makeExplanation(stackLevel - 1));
            }
        }(cur.expression, cur.executionType, cur.evaluateState, null, [], null);
    }
}
