// Port of xyz.columnal.transformations.expression.InvalidOperatorExpression (expressions module).
import { javaEquals, javaHashCode } from "../../../java/JavaObject.js";
import type { JavaRandom } from "../../../java/JavaRandom.js";
import type { TableAndColumnRenames } from "../../../identifiers/id/TableAndColumnRenames.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import type { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../utility-error/error/InternalException.js";
import { StyledString, type StyleTarget } from "../../../utility-error/styled/StyledString.js";
import { Utility } from "../../../utility/utility/Utility.js";
import { BracketedStatus } from "./BracketedStatus.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import type { EvaluateState } from "./EvaluateState.js";
import { type Expression, NonOperatorExpression } from "./Expressions.js";
import type { TypeState } from "./TypeState.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";

/**
 * An expression with mixed operators, which make it invalid.  Can't be run, but may be
 * used while editing and for loading/saving invalid expressions.
 */
export class InvalidOperatorExpression extends NonOperatorExpression
{
    private readonly items: readonly Expression[];

    public constructor(operands: readonly Expression[])
    {
        super();
        this.items = operands;
    }

    public override check(_dataLookup: Expression.ColumnLookup, _typeState: TypeState, _kind: Expression.ExpressionKind, _locationInfo: Expression.LocationInfo, _onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        // Error should have been recorded elsewhere
        //onError.recordError(this, StyledString.s("Mixed or invalid operators in expression"));
        return null; // Invalid expressions can't type check
    }

    public override calculateValue(_state: EvaluateState): Expression.ValueResult
    {
        throw new InternalException("Cannot get value for invalid expression");
    }

    public override save(saveDestination: Expression.SaveDestination, _surround: BracketedStatus, renames: TableAndColumnRenames): string
    {
        if (saveDestination.needKeywords())
            return "@invalidops(" + this.items.map(x => x.save(saveDestination, BracketedStatus.NEED_BRACKETS, renames)).join(", ")+ ")";
        else
            return this.items.map(x => x.save(saveDestination, BracketedStatus.NEED_BRACKETS, renames)).join("");
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
        if (!(o instanceof InvalidOperatorExpression) || o.constructor !== this.constructor) return false;

        const that = o;

        return javaEquals(this.items, that.items);
    }

    public override hashCode(): number
    {
        return javaHashCode(this.items);
    }

    public override toDisplay(displayType: Expression.DisplayType, _bracketedStatus: BracketedStatus, expressionStyler: Expression.ExpressionStyler): StyledString
    {
        const r = StyledString.builder();

        for (const item of this.items)
        {
            r.append(item.toDisplay(displayType, BracketedStatus.NEED_BRACKETS, expressionStyler));
        }

        return expressionStyler(r.build(StyledString.s(" ")).withStyle(new ErrorStyle()), this);
    }

    public override replaceSubExpression(toReplace: Expression, replaceWith: Expression): Expression
    {
        if (this === toReplace)
            return replaceWith;
        else
            return new InvalidOperatorExpression(Utility.mapListI(this.items, e => e.replaceSubExpression(toReplace, replaceWith)));
    }

    public _test_getItems(): readonly Expression[]
    {
        return this.items;
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        return visitor.invalidOps(this, this.items);
    }
}

// Java: a local class in toDisplay
class ErrorStyle extends StyledString.Style<ErrorStyle>
{
    public constructor()
    {
        super(ErrorStyle);
    }

    public override applyTo(target: StyleTarget): void
    {
        target.classes.add("expression-error");
    }

    public override combine(_withStyle: ErrorStyle): ErrorStyle
    {
        return this;
    }

    protected override equalsStyle(item: ErrorStyle): boolean
    {
        return item instanceof ErrorStyle;
    }
}
