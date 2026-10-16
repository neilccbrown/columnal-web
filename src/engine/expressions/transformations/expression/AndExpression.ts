// Port of xyz.columnal.transformations.expression.AndExpression (expressions module).
import type { JavaRandom } from "../../../java/JavaRandom.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import { TypeExp } from "../../../types/typeExp/TypeExps.js";
import { Utility } from "../../../utility/utility/Utility.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import type { EvaluateState } from "./EvaluateState.js";
import { Expression, type NaryOpExpression, NaryOpShortCircuitExpression } from "./Expressions.js";
import type { TypeState } from "./TypeState.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";

/**
 * Created by neil on 10/12/2016.
 */
export class AndExpression extends NaryOpShortCircuitExpression
{
    public constructor(expressions: readonly Expression[])
    {
        super(expressions);
    }

    public override copyNoNull(replacements: readonly Expression[]): NaryOpExpression
    {
        return new AndExpression(replacements);
    }

    protected override saveOp(_index: number): string
    {
        return "&";
    }

    public override checkNaryOp(dataLookup: Expression.ColumnLookup, state: TypeState, _kind: Expression.ExpressionKind, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        // And has a special property: the type state is threaded through to the next item.
        for (const expression of this.expressions)
        {
            const checked = expression.check(dataLookup, state, Expression.ExpressionKind.EXPRESSION, Expression.LocationInfo.UNIT_DEFAULT, onError);
            if (checked === null)
                return null;

            if (onError.recordError(expression, TypeExp.unifyTypes(TypeExp.bool(this), checked.typeExp)) === null)
                return null;
            state = checked.typeState;
        }
        return new Expression.CheckedExp(onError.recordTypeNN(this, TypeExp.bool(this)), state);
    }

    public override getValueNaryOp(origState: EvaluateState): Expression.ValueResult
    {
        let state = origState;
        const values: Expression.ValueResult[] = [];
        for (let i = 0; i < this.expressions.length; i++)
        {
            const expression = this.expressions[i]!;
            const valState = this.fetchSubExpression(expression, state, values);
            const b = Utility.cast(valState.value, Boolean);
            if (!b)
            {
                return this.result(DataTypeUtility.value(false), origState, [...values]);
            }
            // In and, state is threaded through to next items:
            state = valState.evaluateState;
        }
        return this.result(DataTypeUtility.value(true), state, [...values]);
    }

    public override _test_typeFailure(r: JavaRandom, newExpressionOfDifferentType: Expression._test_TypeVary, _unitManager: UnitManager): Expression | null
    {
        const index = r.nextInt(this.expressions.length);
        return this.copy(this.makeNullList(index, newExpressionOfDifferentType.getDifferentType(TypeExp.bool(null))));
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        return visitor.and(this, this.expressions);
    }
}
