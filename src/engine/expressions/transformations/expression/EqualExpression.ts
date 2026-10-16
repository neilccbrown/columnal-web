// Port of xyz.columnal.transformations.expression.EqualExpression (expressions module).
import type { JavaRandom } from "../../../java/JavaRandom.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import { MutVar, TypeExp } from "../../../types/typeExp/TypeExps.js";
import { InternalException } from "../../../utility-error/error/InternalException.js";
import { UserException } from "../../../utility-error/error/UserException.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import { Utility } from "../../../utility/utility/Utility.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import type { EvaluateState } from "./EvaluateState.js";
import { EvaluationException } from "./EvaluationException.js";
import { Explanation } from "./explanation/Explanation.js";
import { Expression, NaryOpExpression, NaryOpShortCircuitExpression } from "./Expressions.js";
import { ExpressionUtil } from "./ExpressionUtil.js";
import type { TypeState } from "./TypeState.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";

/**
 * Created by neil on 30/11/2016.
 */
export class EqualExpression extends NaryOpShortCircuitExpression
{
    // Is the last item in the operators a pattern?  If so, last operator is =~ rather than =
    private readonly _lastIsPattern: boolean;

    public constructor(operands: readonly Expression[], lastIsPattern: boolean)
    {
        super(operands);
        this._lastIsPattern = lastIsPattern;
    }

    public override copyNoNull(replacements: readonly Expression[]): NaryOpExpression
    {
        return new EqualExpression(replacements, this._lastIsPattern);
    }

    protected override saveOp(index: number): string
    {
        if (this._lastIsPattern && index === this.expressions.length - 2)
            return "=~";
        else
            return "=";
    }

    public override checkNaryOp(dataLookup: Expression.ColumnLookup, typeState: TypeState, _expressionKind: Expression.ExpressionKind, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        if (this._lastIsPattern && this.expressions.length > 2)
        {
            // If there is a pattern and an expression, we don't allow two expressions, because it's not
            // easily obvious to the user what the semantics should be e.g. 1 = @anything = 2, or particularly
            // (1, (? + 1)) = (1, @anything) = (1, (? + 2)).
            onError.recordError(this, StyledString.s("Cannot have a pattern in an equals expression with more than two operands."));
            // (This shouldn't really be reachable if all other systems are working right, but good as a sanity check)
            return null;
        }

        // The one to be returned, but not used for later operands:
        let retTypeState = typeState;

        // The rule is that zero or one args can be a pattern, the rest must be expressions.
        // The type state must not carry over between operands, because otherwise you could write if ($s, $t) = (t, s) which doesn't pan out,
        // because all the non-patterns must be evaluated before the pattern.
        const type: TypeExp = new MutVar(this);
        const invalidIndexes: number[] = [];
        const expressionTypes: (TypeExp | null)[] = [];
        for (let i = 0; i < this.expressions.length; i++)
        {
            let invalid = false;
            const expression = this.expressions[i]!;
            const checked = expression.check(dataLookup, typeState, (this._lastIsPattern && i === this.expressions.length - 1) ? Expression.ExpressionKind.PATTERN : Expression.ExpressionKind.EXPRESSION, Expression.LocationInfo.UNIT_CONSTRAINED, onError);
            expressionTypes.push(checked === null ? null : checked.typeExp);
            if (checked === null)
            {
                invalid = true;
            }
            else
            {
                checked.requireEquatable();
                if (!invalid && onError.recordError(this, TypeExp.unifyTypes(type, checked.typeExp)) === null)
                {
                    invalid = true;
                }

                if (this._lastIsPattern && i === this.expressions.length - 1)
                    retTypeState = checked.typeState;
            }

            if (invalid)
            {
                invalidIndexes.push(i);
            }
        }
        if (invalidIndexes.length !== 0)
        {
            for (const index of invalidIndexes)
            {
                const tpd = new NaryOpExpression.TypeProblemDetails([...expressionTypes], [...this.expressions], index);
                onError.recordQuickFixes(this.expressions[index]!, ExpressionUtil.getFixesForMatchingNumericUnits(typeState, tpd));
            }
            return null;
        }

        return onError.recordType(this, retTypeState, TypeExp.bool(this));
    }

    public override getValueNaryOp(state: EvaluateState): Expression.ValueResult
    {
        if (this._lastIsPattern)
        {
            if (this.expressions.length !== 2)
                throw new InternalException("Pattern present in equals despite having more than two operands");
            const lhsrhs: Expression.ValueResult[] = [];
            const value = this.fetchSubExpression(this.expressions[0]!, state, lhsrhs);
            const matchResult = this.matchSubExpressionAsPattern(this.expressions[1]!, value.value, state, lhsrhs);
            const matched = Utility.cast(matchResult.value, Boolean);
            return this.result(DataTypeUtility.value(matched), matched ? matchResult.evaluateState : state, [value, matchResult]);
        }
        else
        {
            const values: Expression.ValueResult[] = [];
            const first = this.fetchSubExpression(this.expressions[0]!, state, values).value;
            for (let i = 1; i < this.expressions.length; i++)
            {
                const rhsVal = this.fetchSubExpression(this.expressions[i]!, state, values).value;
                try
                {
                    if (0 !== Utility.compareValues(first, rhsVal))
                    {
                        return this.result(DataTypeUtility.value(false), state, [...values]);
                    }
                }
                catch (e)
                {
                    if (!(e instanceof UserException))
                        throw e;
                    throw new EvaluationException(e, this, Explanation.ExecutionType.VALUE, state, [...values]);
                }
            }

            return this.result(DataTypeUtility.value(true), state, [...values]);
        }
    }

    public override _test_typeFailure(_r: JavaRandom, _newExpressionOfDifferentType: Expression._test_TypeVary, _unitManager: UnitManager): Expression | null
    {
        return null;
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        return visitor.equal(this, this.expressions, this._lastIsPattern);
    }

    public getOperands(): readonly Expression[]
    {
        return this.expressions;
    }

    public lastIsPattern(): boolean
    {
        return this._lastIsPattern;
    }
}
