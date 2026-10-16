// Port of xyz.columnal.transformations.expression.RaiseExpression (expressions module).
import { ArithmeticException, Decimal } from "../../../java/JavaBigDecimal.js";
import { NumTypeExp, TypeExp } from "../../../types/typeExp/TypeExps.js";
import { MutUnitVar } from "../../../types/typeExp/units/MutUnitVar.js";
import { UnitExp } from "../../../types/typeExp/units/UnitExp.js";
import { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import { Utility } from "../../../utility/utility/Utility.js";
import type { Value } from "../../../utility/utility/Value.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import { BinaryOpExpression, Expression } from "./Expressions.js";
import type { TypeState } from "./TypeState.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";

/** Java: BigInteger.intValueExact() */
function intValueExact(b: bigint): number
{
    if (b < -2147483648n || b > 2147483647n)
        throw new ArithmeticException("BigInteger out of int range");
    return Number(b);
}

/**
 * Created by neil on 13/12/2016.
 */
export class RaiseExpression extends BinaryOpExpression
{
    public constructor(lhs: Expression, rhs: Expression)
    {
        super(lhs, rhs);
    }

    protected override saveOp(): string
    {
        return "^";
    }

    public override copy(replaceLHS: Expression | null, replaceRHS: Expression | null): BinaryOpExpression
    {
        return new RaiseExpression(replaceLHS === null ? this.lhs : replaceLHS, replaceRHS === null ? this.rhs : replaceRHS);
    }

    protected override checkBinaryOp(_data: Expression.ColumnLookup, typeState: TypeState, _kind: Expression.ExpressionKind, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        const lhsTypeFinal = this.lhsType!.typeExp;
        const rhsTypeFinal = this.rhsType!.typeExp;

        // Raise expression is sort of an overloaded operator.  If the right-hand side is an integer
        // constant, it adjusts the units on the left-hand side.  Otherwise, it requires unit-less
        // items on both sides.

        // So, we attempt to constant-fold the RHS to distinguish:
        const rhsPower = this.rhs.constantFold();
        if (rhsPower !== null)
        {
            const r = rhsPower;
            const numeratorOne = r.getNum() === 1n;
            const denominatorOne = r.getDen() === 1n;
            if (numeratorOne && denominatorOne)
            {
                // Raising to power 1, just leave type as-is:
                return new Expression.CheckedExp(lhsTypeFinal, typeState);
            }
            else if (numeratorOne || denominatorOne)
            {
                let ourType: TypeExp;
                // Either raising to an integer power, or rooting:
                try
                {
                    if (numeratorOne)
                    {
                        // Rooting by integer power:

                        // We raise LHS units to the opposite:
                        const lhsUnit = new MutUnitVar();
                        if (onError.recordError(this, TypeExp.unifyTypes(lhsTypeFinal, new NumTypeExp(this, new UnitExp(lhsUnit).raisedTo(intValueExact(r.getDen()))))) === null)
                            return null;
                        ourType = new NumTypeExp(this, new UnitExp(lhsUnit));
                    }
                    else
                    {
                        // Raising to integer power:
                        const lhsUnit = new MutUnitVar();
                        if (onError.recordError(this, TypeExp.unifyTypes(lhsTypeFinal, new NumTypeExp(this, new UnitExp(lhsUnit)))) === null)
                            return null;
                        ourType = new NumTypeExp(this, new UnitExp(lhsUnit).raisedTo(intValueExact(r.getNum())));
                    }
                    return new Expression.CheckedExp(onError.recordTypeNN(this, ourType), typeState);
                }
                catch (e)
                {
                    if (!(e instanceof ArithmeticException))
                        throw e;
                    onError.recordError(this.rhs, StyledString.s("Power is too large to track the units"));
                    return null;
                }
            }

            // If power is not 1, integer, or 1/integer, fall through:
        }

        if (onError.recordError(this, TypeExp.unifyTypes(TypeExp.plainNumber(this), lhsTypeFinal)) === null)
            return null;
        if (onError.recordError(this, TypeExp.unifyTypes(TypeExp.plainNumber(this), rhsTypeFinal)) === null)
            return null;
        return new Expression.CheckedExp(onError.recordTypeNN(this, TypeExp.plainNumber(this)), typeState);
    }

    protected override getOperandKinds(): Pair<Expression.ExpressionKind, Expression.ExpressionKind>
    {
        return new Pair(Expression.ExpressionKind.EXPRESSION, Expression.ExpressionKind.EXPRESSION);
    }

    public override getValueBinaryOp(lhsValue: Expression.ValueResult, rhsValue: Expression.ValueResult): Value
    {
        return Utility.raiseNumber(Utility.cast(lhsValue.value, Decimal), Utility.cast(rhsValue.value, Decimal));
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        return visitor.raise(this, this.lhs, this.rhs);
    }
}
