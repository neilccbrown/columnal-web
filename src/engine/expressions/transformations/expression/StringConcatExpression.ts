// Port of xyz.columnal.transformations.expression.StringConcatExpression (expressions module).
import type { JavaRandom } from "../../../java/JavaRandom.js";
import { javaRegionMatches } from "../../../java/JavaString.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import { TypeExp } from "../../../types/typeExp/TypeExps.js";
import { Either } from "../../../utility-adt/utility/adt/Either.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import { Utility } from "../../../utility/utility/Utility.js";
import type { Value } from "../../../utility/utility/Value.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import type { EvaluateState } from "./EvaluateState.js";
import { Explanation } from "./explanation/Explanation.js";
import { Expression, IdentExpression, MatchAnythingExpression, type NaryOpExpression, NaryOpTotalExpression } from "./Expressions.js";
import type { TypeState } from "./TypeState.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";

export class StringConcatExpression extends NaryOpTotalExpression
{
    public constructor(operands: readonly Expression[])
    {
        super(operands);

    }

    public override copyNoNull(replacements: readonly Expression[]): NaryOpExpression
    {
        return new StringConcatExpression(replacements);
    }

    protected override saveOp(_index: number): string
    {
        return ";";
    }

    public override checkNaryOp(dataLookup: Expression.ColumnLookup, state: TypeState, kind: Expression.ExpressionKind, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        // Items in a String concat expression can be:
        // - Variable declaration
        // - Values
        // With the added restriction that two variables cannot be adjacent.
        // Although it's a bit hacky, we check for variables directly from here using instanceof

        let lastWasVariable = false;
        for (const expression of this.expressions)
        {
            if (this.isPattern(expression))
            {
                if (lastWasVariable)
                {
                    onError.recordError(expression, Either.left<TypeExp.TypeError | null, TypeExp>(new TypeExp.TypeError(StyledString.s("Cannot have two variables/match-any next to each other in text pattern match; how can we know where one match stops and the next begins?"), [])));
                    return null;
                }
                else
                {
                    lastWasVariable = true;
                }
            }
            else
            {

                lastWasVariable = false;
            }
            const c = expression.check(dataLookup, state, kind, Expression.LocationInfo.UNIT_DEFAULT, onError);

            if (c === null)
                return null;
            // TODO offer a quick fix of wrapping to.string around operand
            if (onError.recordError(this, TypeExp.unifyTypes(TypeExp.text(this), c.typeExp)) === null)
                return null;
            state = c.typeState;
        }
        return onError.recordType(this, state, TypeExp.text(this));
    }

    public override getValueNaryOp(values: readonly Expression.ValueResult[], state: EvaluateState): Expression.ValueResult
    {
        let sb = "";
        for (const value of values)
        {
            const s = Utility.cast(value.value, String);
            sb += s;
        }
        return this.result(DataTypeUtility.value(sb), state, values);
    }

    public override matchAsPattern(value: Value, originalState: EvaluateState): Expression.ValueResult
    {
        const s = Utility.cast(value, String);
        let curOffset = 0;

        const matches: Expression.ValueResult[] = [];
        let pendingMatch: Expression | null = null;
        let threadedState = originalState;
        for (let i = 0; i < this.expressions.length; i++)
        {
            if (this.isPattern(this.expressions[i]!))
            {
                pendingMatch = this.expressions[i]!;
            }
            else
            {
                // It's a value; get that value:
                const valueToFind = this.fetchSubExpression(this.expressions[i]!, threadedState, matches);
                const subValue = Utility.cast(valueToFind.value, String);
                if (subValue.length === 0)
                {
                    // Matches, but nothing to do.  Keep going...
                }
                else if (pendingMatch === null)
                {
                    // Must match exactly:
                    if (javaRegionMatches(s, false, curOffset, subValue, 0, subValue.length))
                    {
                        // Fine, proceed!
                        curOffset += subValue.length;
                    }
                    else
                    {
                        // Can't match
                        return this.explanation(DataTypeUtility.value(false), Explanation.ExecutionType.MATCH, originalState, [...matches], [], false);
                    }
                    pendingMatch = null;
                }
                else
                {
                    // We find the next occurrence:
                    const nextPos = s.indexOf(subValue, curOffset);
                    if (nextPos === -1)
                        return this.explanation(DataTypeUtility.value(false), Explanation.ExecutionType.MATCH, originalState, [...matches], [], false);
                    const match = this.matchSubExpressionAsPattern(pendingMatch, DataTypeUtility.value(s.substring(curOffset, nextPos)), threadedState, matches);
                    if (!Utility.cast(match.value, Boolean))
                        return this.explanation(DataTypeUtility.value(false), Explanation.ExecutionType.MATCH, originalState, [...matches], [], false);
                    threadedState = match.evaluateState;
                    curOffset = nextPos + subValue.length;
                    pendingMatch = null;
                }
            }
        }
        if (pendingMatch !== null)
        {
            const last = this.matchSubExpressionAsPattern(pendingMatch, DataTypeUtility.value(s.substring(curOffset)), threadedState, matches);
            if (!Utility.cast(last.value, Boolean))
                return this.explanation(DataTypeUtility.value(false), Explanation.ExecutionType.MATCH, originalState, [...matches], [], false);
            threadedState = last.evaluateState;
        }


        return this.explanation(DataTypeUtility.value(true), Explanation.ExecutionType.MATCH, threadedState, [...matches], [], false);
    }

    private isPattern(expression: Expression): boolean
    {
        if (expression instanceof MatchAnythingExpression)
            return true;
        if (expression instanceof IdentExpression)
        {
            if (expression.isVarDeclaration())
                return true;
        }
        return false;
    }

    public override _test_typeFailure(_r: JavaRandom, _newExpressionOfDifferentType: Expression._test_TypeVary, _unitManager: UnitManager): Expression | null
    {
        return null;
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        return visitor.concatText(this, this.expressions);
    }
}
