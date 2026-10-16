// Port of xyz.columnal.transformations.expression.TimesExpression (expressions module).
import { Decimal } from "../../../java/JavaBigDecimal.js";
import type { JavaRandom } from "../../../java/JavaRandom.js";
import { Rational } from "../../../java/Rational.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import { NumTypeExp, TypeExp } from "../../../types/typeExp/TypeExps.js";
import { UnitExp } from "../../../types/typeExp/units/UnitExp.js";
import { Utility } from "../../../utility/utility/Utility.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import type { EvaluateState } from "./EvaluateState.js";
import { Expression, type NaryOpExpression, NaryOpTotalExpression } from "./Expressions.js";
import type { TypeState } from "./TypeState.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";

/**
 * Created by neil on 29/11/2016.
 */
export class TimesExpression extends NaryOpTotalExpression
{
    public constructor(expressions: readonly Expression[])
    {
        super(expressions);
    }

    public override copyNoNull(replacements: readonly Expression[]): NaryOpExpression
    {
        return new TimesExpression(replacements);
    }

    public override constantFold(): Rational | null
    {
        let running = Rational.ONE;
        for (const expression of this.expressions)
        {
            const r = expression.constantFold();
            if (r !== null)
                running = running.times(r);
            else
                return null;
        }
        return running;
    }

    protected override saveOp(_index: number): string
    {
        return "*";
    }

    public override checkNaryOp(dataLookup: Expression.ColumnLookup, state: TypeState, _kind: Expression.ExpressionKind, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        let runningUnit = UnitExp.SCALAR;
        for (const expression of this.expressions)
        {
            const unitVar = UnitExp.makeVariable();
            const expectedType: TypeExp = new NumTypeExp(this, unitVar);
            const inferredType = expression.check(dataLookup, state, Expression.ExpressionKind.EXPRESSION, Expression.LocationInfo.UNIT_MODIFYING, onError);
            if (inferredType === null)
                return null;

            // This should unify our unitVar appropriately:
            if (onError.recordError(this, TypeExp.unifyTypes(expectedType, inferredType.typeExp)) === null)
                return null;

            runningUnit = runningUnit.times(unitVar);
        }
        return onError.recordType(this, state, new NumTypeExp(this, runningUnit));
    }

    public override getValueNaryOp(values: readonly Expression.ValueResult[], state: EvaluateState): Expression.ValueResult
    {
        let n = Utility.cast(values[0]!.value, Decimal);
        for (let i = 1; i < this.expressions.length; i++)
            n = Utility.multiplyNumbers(n, Utility.cast(values[i]!.value, Decimal));
        return this.result(n, state, values);
    }

    public override _test_typeFailure(r: JavaRandom, newExpressionOfDifferentType: Expression._test_TypeVary, _unitManager: UnitManager): Expression | null
    {
        const index = r.nextInt(this.expressions.length);
        return this.copy(this.makeNullList(index, newExpressionOfDifferentType.getNonNumericType()));
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        return visitor.multiply(this, this.expressions);
    }
}
