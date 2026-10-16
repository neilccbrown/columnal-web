// Port of xyz.columnal.transformations.expression.PlusMinusPatternExpression (expressions module).
import { Decimal } from "../../../java/JavaBigDecimal.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import { NumTypeExp, TypeExp } from "../../../types/typeExp/TypeExps.js";
import { MutUnitVar } from "../../../types/typeExp/units/MutUnitVar.js";
import { UnitExp } from "../../../types/typeExp/units/UnitExp.js";
import { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../utility-error/error/InternalException.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import { EpsilonType, Utility } from "../../../utility/utility/Utility.js";
import type { Value } from "../../../utility/utility/Value.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import type { EvaluateState } from "./EvaluateState.js";
import { Explanation } from "./explanation/Explanation.js";
import { BinaryOpExpression, Expression } from "./Expressions.js";
import type { TypeState } from "./TypeState.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";

/**
 * This is a pattern match item, value +- tolerance.
 */
export class PlusMinusPatternExpression extends BinaryOpExpression
{
    public constructor(lhs: Expression, rhs: Expression)
    {
        super(lhs, rhs);
    }

    protected override saveOp(): string
    {
        return "±";
    }

    public override copy(replaceLHS: Expression | null, replaceRHS: Expression | null): BinaryOpExpression
    {
        return new PlusMinusPatternExpression(replaceLHS === null ? this.lhs : replaceLHS, replaceRHS === null ? this.rhs : replaceRHS);
    }

    protected override checkBinaryOp(_data: Expression.ColumnLookup, state: TypeState, kind: Expression.ExpressionKind, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        if (kind !== Expression.ExpressionKind.PATTERN)
        {
            onError.recordError(this, StyledString.s(this.saveOp() + " is not valid outside a pattern"));
            return null;
        }

        // The LHS and RHS must be numbers with matching units.  The result is then that same number
        // LHS needs to be specific number value.


        return onError.recordTypeAndError(this, TypeExp.unifyTypes(new NumTypeExp(this, new UnitExp(new MutUnitVar())), this.lhsType!.typeExp, this.rhsType!.typeExp), state);
    }

    protected override getOperandKinds(): Pair<Expression.ExpressionKind, Expression.ExpressionKind>
    {
        // A pattern would not be valid on the left (how do you match 5.6 against defvar x +- 0.1 ?  Either match
        // just against var x, or give value.  That would also allow weird nestings like (1 +- 0.1) +- 0.2), and exact same idea for RHS.
        return new Pair(Expression.ExpressionKind.EXPRESSION, Expression.ExpressionKind.EXPRESSION);
    }

    public override getValueBinaryOp(_lhsValue: Expression.ValueResult, _rhsValue: Expression.ValueResult): Value
    {
        throw new InternalException("Calling getValue on plus minus pattern (should only call matchAsPattern)");
    }

    public override matchAsPattern(value: Value, state: EvaluateState): Expression.ValueResult
    {
        const lhsrhs: Expression.ValueResult[] = [];
        const lhsValue = this.fetchSubExpression(this.lhs, state, lhsrhs).value;
        const rhsValue = this.fetchSubExpression(this.rhs, state, lhsrhs).value;
        const match = Utility.compareNumbers(Utility.cast(value, Decimal), Utility.cast(lhsValue, Decimal), new Pair(EpsilonType.ABSOLUTE, Utility.toBigDecimal(Utility.cast(rhsValue, Decimal)))) === 0;
        return this.explanation(DataTypeUtility.value(match), Explanation.ExecutionType.MATCH, state, [...lhsrhs], [], false);
    }

    protected override argLocationInfo(): Expression.LocationInfo
    {
        return Expression.LocationInfo.UNIT_CONSTRAINED;
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        return visitor.plusMinus(this, this.lhs, this.rhs);
    }
}
