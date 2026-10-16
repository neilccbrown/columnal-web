// Port of xyz.columnal.transformations.expression.Literal (expressions module).
import type { JavaRandom } from "../../../java/JavaRandom.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import type { TypeExp } from "../../../types/typeExp/TypeExps.js";
import type { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import { Expression, NonOperatorExpression } from "./Expressions.js";
import type { TypeState } from "./TypeState.js";

/**
 * Created by neil on 27/11/2016.
 */
export abstract class Literal extends NonOperatorExpression
{
    public override check(_dataLookup: Expression.ColumnLookup, typeState: TypeState, _kind: Expression.ExpressionKind, locationInfo: Expression.LocationInfo, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        const typeExp = onError.recordType(this, this.checkType(typeState, locationInfo, onError));
        if (typeExp === null)
            return null;
        else
            return new Expression.CheckedExp(typeExp, typeState);
    }

    protected abstract checkType(typeState: TypeState, locationInfo: Expression.LocationInfo, onError: ErrorAndTypeRecorder): TypeExp | null;

    public override _test_childMutationPoints(): Pair<Expression, (e: Expression) => Expression>[]
    {
        return [];
    }

    public override _test_typeFailure(_r: JavaRandom, _newExpressionOfDifferentType: Expression._test_TypeVary, _unitManager: UnitManager): Expression | null
    {
        return null;
    }

    public abstract editString(): string;

    public override replaceSubExpression(toReplace: Expression, replaceWith: Expression): Expression
    {
        return this === toReplace ? replaceWith : this;
    }

    public override hideFromExplanation(_skipIfTrivial: boolean): boolean
    {
        return true;
    }
}
