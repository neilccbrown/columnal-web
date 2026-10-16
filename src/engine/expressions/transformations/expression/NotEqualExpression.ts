// Port of xyz.columnal.transformations.expression.NotEqualExpression (expressions module).
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import { TypeExp } from "../../../types/typeExp/TypeExps.js";
import { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { Utility } from "../../../utility/utility/Utility.js";
import type { Value } from "../../../utility/utility/Value.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import { BinaryOpExpression, Expression, NaryOpExpression } from "./Expressions.js";
import { ExpressionUtil } from "./ExpressionUtil.js";
import type { TypeState } from "./TypeState.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";

/**
 * Created by neil on 30/11/2016.
 */
export class NotEqualExpression extends BinaryOpExpression
{
    public constructor(lhs: Expression, rhs: Expression)
    {
        super(lhs, rhs);
    }

    protected override saveOp(): string
    {
        return "<>";
    }

    public override checkBinaryOp(_data: Expression.ColumnLookup, state: TypeState, _kind: Expression.ExpressionKind, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        const lhsType = this.lhsType!;
        const rhsType = this.rhsType!;
        // TODO add this as a quick fix
        //onError.recordError(this, StyledString.s("Patterns not allowed in <>  Use not(... =~ ...) instead"));
        lhsType.requireEquatable();
        rhsType.requireEquatable();
        if (onError.recordError(this, TypeExp.unifyTypes(lhsType.typeExp, rhsType.typeExp)) === null)
        {
            const expressionTypes = [lhsType.typeExp, rhsType.typeExp];
            onError.recordQuickFixes(this.lhs, ExpressionUtil.getFixesForMatchingNumericUnits(state, new NaryOpExpression.TypeProblemDetails(expressionTypes, [this.lhs, this.rhs], 0)));
            onError.recordQuickFixes(this.rhs, ExpressionUtil.getFixesForMatchingNumericUnits(state, new NaryOpExpression.TypeProblemDetails(expressionTypes, [this.lhs, this.rhs], 1)));
            return null;
        }
        return new Expression.CheckedExp(onError.recordTypeNN(this, TypeExp.bool(this)), state);
    }

    protected override getOperandKinds(): Pair<Expression.ExpressionKind, Expression.ExpressionKind>
    {
        // We could offer a <>~ operator -- but we don't at the moment:
        return new Pair(Expression.ExpressionKind.EXPRESSION, Expression.ExpressionKind.EXPRESSION);
    }

    public override getValueBinaryOp(lhsValue: Expression.ValueResult, rhsValue: Expression.ValueResult): Value
    {
        return DataTypeUtility.value(0 !== Utility.compareValues(lhsValue.value, rhsValue.value));
    }

    public override copy(replaceLHS: Expression | null, replaceRHS: Expression | null): BinaryOpExpression
    {
        return new NotEqualExpression(replaceLHS === null ? this.lhs : replaceLHS, replaceRHS === null ? this.rhs : replaceRHS);
    }

    protected override argLocationInfo(): Expression.LocationInfo
    {
        return Expression.LocationInfo.UNIT_CONSTRAINED;
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        return visitor.notEqual(this, this.lhs, this.rhs);
    }
}
