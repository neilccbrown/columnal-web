// Port of xyz.columnal.transformations.expression.DivideExpression (expressions module).
import { Decimal } from "../../../java/JavaBigDecimal.js";
import type { JavaRandom } from "../../../java/JavaRandom.js";
import type { Rational } from "../../../java/Rational.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import { NumTypeExp, TypeExp } from "../../../types/typeExp/TypeExps.js";
import { UnitExp } from "../../../types/typeExp/units/UnitExp.js";
import { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { Utility } from "../../../utility/utility/Utility.js";
import type { Value } from "../../../utility/utility/Value.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import { BinaryOpExpression, Expression } from "./Expressions.js";
import type { TypeState } from "./TypeState.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";

/**
 * Created by neil on 10/12/2016.
 */
export class DivideExpression extends BinaryOpExpression
{
    public constructor(lhs: Expression, rhs: Expression)
    {
        super(lhs, rhs);
    }

    protected override saveOp(): string
    {
        return "/";
    }

    public override copy(replaceLHS: Expression | null, replaceRHS: Expression | null): BinaryOpExpression
    {
        return new DivideExpression(replaceLHS === null ? this.lhs : replaceLHS, replaceRHS === null ? this.rhs : replaceRHS);
    }

    protected override checkBinaryOp(_data: Expression.ColumnLookup, state: TypeState, _kind: Expression.ExpressionKind, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        const lhsTypeFinal = this.lhsType!.typeExp;
        const rhsTypeFinal = this.rhsType!.typeExp;
        const topUnit = UnitExp.makeVariable();
        const bottomUnit = UnitExp.makeVariable();
        // You can divide any number by any other number
        if (onError.recordError(this, TypeExp.unifyTypes(new NumTypeExp(this, topUnit), lhsTypeFinal)) === null
            || onError.recordError(this, TypeExp.unifyTypes(new NumTypeExp(this, bottomUnit), rhsTypeFinal)) === null)
        {
            return null;
        }
        return new Expression.CheckedExp(onError.recordTypeNN(this, new NumTypeExp(this, topUnit.divideBy(bottomUnit))), state);
    }

    protected override getOperandKinds(): Pair<Expression.ExpressionKind, Expression.ExpressionKind>
    {
        return new Pair(Expression.ExpressionKind.EXPRESSION, Expression.ExpressionKind.EXPRESSION);
    }

    public override getValueBinaryOp(lhsValue: Expression.ValueResult, rhsValue: Expression.ValueResult): Value
    {
        return Utility.divideNumbers(Utility.cast(lhsValue.value, Decimal), Utility.cast(rhsValue.value, Decimal));
    }

    public override constantFold(): Rational | null
    {
        const l = this.lhs.constantFold();
        const r = this.rhs.constantFold();
        if (l !== null && r !== null)
            return l.divides(r);
        else
            return null;
    }

    public override _test_typeFailure(r: JavaRandom, newExpressionOfDifferentType: Expression._test_TypeVary, _unitManager: UnitManager): Expression | null
    {
        if (r.nextBoolean())
        {
            return this.copy(newExpressionOfDifferentType.getNonNumericType(), this.rhs);
        }
        else
        {
            return this.copy(this.lhs, newExpressionOfDifferentType.getNonNumericType());
        }
    }

    protected override argLocationInfo(): Expression.LocationInfo
    {
        return Expression.LocationInfo.UNIT_MODIFYING;
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        return visitor.divide(this, this.lhs, this.rhs);
    }
}
