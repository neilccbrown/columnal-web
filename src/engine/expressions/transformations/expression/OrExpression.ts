// Port of xyz.columnal.transformations.expression.OrExpression (expressions module).
import { javaEquals } from "../../../java/JavaObject.js";
import type { JavaRandom } from "../../../java/JavaRandom.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import { TypeExp } from "../../../types/typeExp/TypeExps.js";
import { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import { Utility } from "../../../utility/utility/Utility.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import type { EvaluateState } from "./EvaluateState.js";
import { Expression, NaryOpExpression, NaryOpShortCircuitExpression } from "./Expressions.js";
import type { QuickFix } from "./QuickFix.js";
import type { TypeState } from "./TypeState.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";

/**
 * Created by neil on 10/12/2016.
 */
export class OrExpression extends NaryOpShortCircuitExpression
{
    public constructor(expressions: readonly Expression[])
    {
        super(expressions);
    }

    public override copyNoNull(replacements: readonly Expression[]): NaryOpExpression
    {
        return new OrExpression(replacements);
    }

    protected override saveOp(_index: number): string
    {
        return "|";
    }

    public override checkNaryOp(dataLookup: Expression.ColumnLookup, state: TypeState, _kind: Expression.ExpressionKind, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        return onError.recordType(this, state, this.checkAllOperandsSameTypeAndNotPatterns(TypeExp.bool(this), dataLookup, state, Expression.LocationInfo.UNIT_DEFAULT, onError, (typeAndExpression) => {
            const ourType = typeAndExpression.getOurType();
            if (ourType === null || javaEquals(ourType.prune(), TypeExp.bool(null)))
            {
                // We're fine or we have no idea.
                return NaryOpExpression.customErrors();
            }
            else
            {
                return NaryOpExpression.customErrors([typeAndExpression.getOurExpression(), new Pair<TypeExp.TypeError | null, readonly QuickFix<Expression>[]>(new TypeExp.TypeError(StyledString.concat(StyledString.s("Operands to '|' must be boolean but found "), ourType.toStyledString()), typeAndExpression.getAvailableTypesForError()), [])]);
            }
        }));
    }

    public override getValueNaryOp(state: EvaluateState): Expression.ValueResult
    {
        const values: Expression.ValueResult[] = [];
        for (let i = 0; i < this.expressions.length; i++)
        {
            const expression = this.expressions[i]!;
            const b = Utility.cast(this.fetchSubExpression(expression, state, values).value, Boolean);
            if (b)
            {
                return this.result(DataTypeUtility.value(true), state, [...values]);
            }
        }
        return this.result(DataTypeUtility.value(false), state, [...values]);
    }

    public override _test_typeFailure(r: JavaRandom, newExpressionOfDifferentType: Expression._test_TypeVary, _unitManager: UnitManager): Expression | null
    {
        const index = r.nextInt(this.expressions.length);
        return this.copy(this.makeNullList(index, newExpressionOfDifferentType.getDifferentType(TypeExp.bool(null))));
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        return visitor.or(this, this.expressions);
    }
}
