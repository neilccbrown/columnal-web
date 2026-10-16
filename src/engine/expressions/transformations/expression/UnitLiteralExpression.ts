// Port of xyz.columnal.transformations.expression.UnitLiteralExpression (expressions module).
import { javaEquals, javaObjectsHash } from "../../../java/JavaObject.js";
import type { JavaRandom } from "../../../java/JavaRandom.js";
import type { TableAndColumnRenames } from "../../../identifiers/id/TableAndColumnRenames.js";
import { TagType } from "../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import { TypeExp } from "../../../types/typeExp/TypeExps.js";
import { Either } from "../../../utility-adt/utility/adt/Either.js";
import type { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import { TaggedValue } from "../../../utility/utility/TaggedValue.js";
import type { BracketedStatus } from "./BracketedStatus.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import type { EvaluateState } from "./EvaluateState.js";
import { type Expression, NonOperatorExpression } from "./Expressions.js";
import type { TypeState } from "./TypeState.js";
import { UnitExpression } from "./UnitExpressions.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";

/**
 * An Expression that contains a UnitExpression.
 */
export class UnitLiteralExpression extends NonOperatorExpression
{
    private readonly unitExpression: UnitExpression;

    public constructor(unitExpression: UnitExpression)
    {
        super();
        this.unitExpression = unitExpression;
    }

    public override check(_dataLookup: Expression.ColumnLookup, typeState: TypeState, _kind: Expression.ExpressionKind, _locationInfo: Expression.LocationInfo, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        // Numeric literals, should not call check on us.
        // Everyone else sees a Unit GADT
        try
        {
            const saved = this.unitExpression.asUnit(typeState.getUnitManager());
            return onError.recordTypeAndError(this, Either.right(TypeExp.unitExpToUnitGADT(this, saved.makeUnitExp(new Map()))), typeState);
        }
        catch (e)
        {
            if (!(e instanceof UnitExpression.UnitLookupException))
                throw e;
            if (e.errorMessage !== null)
                onError.recordError(this, e.errorMessage);
            return null;
        }
    }

    public override calculateValue(state: EvaluateState): Expression.ValueResult
    {
        // TODO return the actual type literal once we define the GADT
        return this.result(new TaggedValue(0, null, DataTypeUtility.fromTags([new TagType<unknown>("Type", null)])), state);
    }

    public override save(saveDestination: Expression.SaveDestination, _surround: BracketedStatus, _renames: TableAndColumnRenames): string
    {
        return "unit{" + this.unitExpression.save(saveDestination, true) + "}";
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
        if (this === o) return true;
        if (!(o instanceof UnitLiteralExpression) || o.constructor !== this.constructor) return false;
        const that = o;
        return javaEquals(this.unitExpression, that.unitExpression);
    }

    public override hashCode(): number
    {
        return javaObjectsHash(this.unitExpression);
    }

    public override toDisplay(_displayType: Expression.DisplayType, _bracketedStatus: BracketedStatus, expressionStyler: Expression.ExpressionStyler): StyledString
    {
        return expressionStyler(StyledString.concat(StyledString.s("unit{"), this.unitExpression.toStyledString(), StyledString.s("}")), this);
    }

    public getUnit(): UnitExpression
    {
        return this.unitExpression;
    }

    public override replaceSubExpression(toReplace: Expression, replaceWith: Expression): Expression
    {
        return this === toReplace ? replaceWith : this;
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        return visitor.litUnit(this, this.unitExpression);
    }
}
