// Port of xyz.columnal.transformations.expression.HasTypeExpression (expressions module).
import type { ExpressionIdentifier } from "../../../anns/Annotations.js";
import { javaObjectsHash } from "../../../java/JavaObject.js";
import type { JavaRandom } from "../../../java/JavaRandom.js";
import type { TableAndColumnRenames } from "../../../identifiers/id/TableAndColumnRenames.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import type { JellyType } from "../../../types/jellytype/JellyTypes.js";
import { TypeExp } from "../../../types/typeExp/TypeExps.js";
import type { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../utility-error/error/InternalException.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import { BracketedStatus } from "./BracketedStatus.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import type { EvaluateState } from "./EvaluateState.js";
import { Expression, type TypeLiteralExpression } from "./Expressions.js";
import type { TypeExpression } from "./type/TypeExpressions.js";
import type { TypeState } from "./TypeState.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";
import { ExpressionVisitorFlat } from "./visitor/ExpressionVisitorFlat.js";

/**
 * A variable name, and a fixed type it should conform to.  Like the :: operator in Haskell expressions,
 * (or like the `asTypeOf` function if you specified a type).
 */
export class HasTypeExpression extends Expression
{
    // Var name, without the leading decorator
    private readonly lhsVar: ExpressionIdentifier;
    private readonly rhsType: Expression;

    public constructor(lhsVar: ExpressionIdentifier, rhsType: Expression)
    {
        super();
        this.lhsVar = lhsVar;
        this.rhsType = rhsType;
    }

    public override check(_dataLookup: Expression.ColumnLookup, original: TypeState, _kind: Expression.ExpressionKind, _locationInfo: Expression.LocationInfo, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        // (Java first records an error if lhsVar is null, which cannot happen.)

        const rhsType = this.rhsType;
        const rhsTypeExpression = this.rhsType.visit(new class extends ExpressionVisitorFlat<TypeExpression | null>
        {
            protected override makeDef(_expression: Expression): TypeExpression | null
            {
                onError.recordError(rhsType, StyledString.s("Right-hand side of :: must be a type{} expression"));
                return null;
            }

            public override litType(_self: TypeLiteralExpression, type: TypeExpression): TypeExpression | null
            {
                return type;
            }
        }());

        if (rhsTypeExpression === null)
            return null;

        const typeState = original.addPreType(this.lhsVar, rhsTypeExpression.toJellyType(original.getTypeManager(), {
            record(jellyType: JellyType, _source: TypeExpression): JellyType
            {
                return jellyType;
            },
        }).makeTypeExp(new Map()), (s: StyledString) => onError.recordError<Expression>(this, s));

        if (typeState === null)
            return null;

        // Our type shouldn't be directly used, but we don't want to return null, hence void:
        return new Expression.CheckedExp(onError.recordTypeNN(this, TypeExp.fromDataType(this, typeState.getTypeManager().getVoidType().instantiate([], typeState.getTypeManager()))), typeState);
    }

    public override calculateValue(_state: EvaluateState): Expression.ValueResult
    {
        throw new InternalException("Type definitions have no value");
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        return visitor.hasType(this, this.lhsVar, this.rhsType);
    }

    public override save(saveDestination: Expression.SaveDestination, _surround: BracketedStatus, renames: TableAndColumnRenames): string
    {
        return this.lhsVar + " :: " + this.rhsType.save(saveDestination, BracketedStatus.NEED_BRACKETS, renames);
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
        if (!(o instanceof HasTypeExpression) || o.constructor !== this.constructor) return false;
        const that = o;
        return this.lhsVar === that.lhsVar &&
                this.rhsType.equals(that.rhsType);
    }

    public override hashCode(): number
    {
        return javaObjectsHash(this.lhsVar, this.rhsType);
    }

    public override toDisplay(displayType: Expression.DisplayType, _bracketedStatus: BracketedStatus, expressionStyler: Expression.ExpressionStyler): StyledString
    {
        return expressionStyler(StyledString.concat(StyledString.s(this.lhsVar), StyledString.s(" :: "), this.rhsType.toDisplay(displayType, BracketedStatus.NEED_BRACKETS, expressionStyler)), this);
    }

    public override replaceSubExpression(toReplace: Expression, replaceWith: Expression): Expression
    {
        if (toReplace === this)
            return replaceWith;
        else
            return new HasTypeExpression(this.lhsVar, this.rhsType.replaceSubExpression(toReplace, replaceWith));
    }

    public getVarName(): ExpressionIdentifier
    {
        return this.lhsVar;
    }
}
