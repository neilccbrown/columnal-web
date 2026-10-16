// Port of xyz.columnal.transformations.expression.MatchAnythingExpression (expressions module).
import type { JavaRandom } from "../../../java/JavaRandom.js";
import type { TableAndColumnRenames } from "../../../identifiers/id/TableAndColumnRenames.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import { MutVar } from "../../../types/typeExp/TypeExps.js";
import type { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../utility-error/error/InternalException.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import type { Value } from "../../../utility/utility/Value.js";
import type { BracketedStatus } from "./BracketedStatus.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import type { EvaluateState } from "./EvaluateState.js";
import { Explanation } from "./explanation/Explanation.js";
import { Expression, NonOperatorExpression } from "./Expressions.js";
import type { TypeState } from "./TypeState.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";

/**
 * Created by neil on 23/02/2017.
 */
export class MatchAnythingExpression extends NonOperatorExpression
{
    public override check(_dataLookup: Expression.ColumnLookup, state: TypeState, kind: Expression.ExpressionKind, _locationInfo: Expression.LocationInfo, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        if (kind !== Expression.ExpressionKind.PATTERN)
        {
            onError.recordError(this, StyledString.s("_ is not valid outside a pattern"));
            return null;
        }

        return new Expression.CheckedExp(onError.recordTypeNN(this, new MutVar(this)), state);
    }

    public override calculateValue(_state: EvaluateState): Expression.ValueResult
    {
        throw new InternalException("Calling getValue on \"_\" pattern (should only call matchAsPattern)");
    }

    public override matchAsPattern(_value: Value, state: EvaluateState): Expression.ValueResult
    {
        // Like the name says, we match anything:
        return this.explanation(DataTypeUtility.value(true), Explanation.ExecutionType.MATCH, state, [], [], false);
    }

    public override hideFromExplanation(skipIfTrivial: boolean): boolean
    {
        return skipIfTrivial;
    }

    public override save(_saveDestination: Expression.SaveDestination, _surround: BracketedStatus, _renames: TableAndColumnRenames): string
    {
        return "_";
    }

    public override toDisplay(_displayType: Expression.DisplayType, _bracketedStatus: BracketedStatus, expressionStyler: Expression.ExpressionStyler): StyledString
    {
        return expressionStyler(StyledString.s("_"), this);
    }

    public override _test_childMutationPoints(): Pair<Expression, (e: Expression) => Expression>[]
    {
        return [];
    }

    public override _test_typeFailure(_r: JavaRandom, _newExpressionOfDifferentType: Expression._test_TypeVary, _unitManager: UnitManager): Expression | null
    {
        return null;
    }

    public override equals(o: unknown): boolean
    {
        return o instanceof MatchAnythingExpression;
    }

    public override hashCode(): number
    {
        return 0;
    }

    public override replaceSubExpression(toReplace: Expression, replaceWith: Expression): Expression
    {
        return this === toReplace ? replaceWith : this;
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        return visitor.matchAnything(this);
    }
}
