// Port of xyz.columnal.transformations.expression.InvalidIdentExpression (expressions module).
import { javaObjectsHash } from "../../../java/JavaObject.js";
import type { JavaRandom } from "../../../java/JavaRandom.js";
import type { TableAndColumnRenames } from "../../../identifiers/id/TableAndColumnRenames.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import { OutputBuilder } from "../../../types/loadsave/OutputBuilder.js";
import type { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../utility-error/error/InternalException.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import { IdentifierUtility } from "../../../utility/utility/IdentifierUtility.js";
import type { BracketedStatus } from "./BracketedStatus.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import type { EvaluateState } from "./EvaluateState.js";
import { type Expression, IdentExpression, NonOperatorExpression } from "./Expressions.js";
import type { TypeState } from "./TypeState.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";

/**
 * A plain identifier.  If it resolves to a variable, it's a variable-use.  If not, it's an unresolved identifier.
 *
 * IdentExpression differs from UnfinishedExpression
 * in that IdentExpression is always *syntactically* valid,
 * whereas UnfinishedExpression is always syntactically
 * *invalid*, because it does not parse as an ident
 * and given its position, it cannot be treated as an
 * operator part of the expression (e.g. a trailing +
 * with no following operand)
 */
export class InvalidIdentExpression extends NonOperatorExpression
{
    private readonly text: string;

    public constructor(text: string)
    {
        super();
        this.text = text;
    }

    public override check(_dataLookup: Expression.ColumnLookup, _state: TypeState, _kind: Expression.ExpressionKind, _locationInfo: Expression.LocationInfo, _onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        // Lexer will have given error so no need for further error:
        return null;
    }

    public override calculateValue(_state: EvaluateState): Expression.ValueResult
    {
        throw new InternalException("Cannot execute invalid ident expression");
    }

    public override save(saveDestination: Expression.SaveDestination, _surround: BracketedStatus, _renames: TableAndColumnRenames): string
    {
        if (saveDestination.needKeywords())
            return "@unfinished " + OutputBuilder.quoted(this.text);
        else
            return this.text;
    }

    public override toDisplay(_displayType: Expression.DisplayType, _bracketedStatus: BracketedStatus, expressionStyler: Expression.ExpressionStyler): StyledString
    {
        return expressionStyler(StyledString.s(this.text), this);
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
        return o instanceof InvalidIdentExpression && this.text === o.text;
    }

    public override hashCode(): number
    {
        return javaObjectsHash(this.text);
    }

    public override replaceSubExpression(toReplace: Expression, replaceWith: Expression): Expression
    {
        return this === toReplace ? replaceWith : this;
    }

    // IdentExpression if possible, otherwise InvalidIdentExpression
    public static identOrUnfinished(src: string): Expression
    {
        const valid = IdentifierUtility.asExpressionIdentifier(src);
        if (valid !== null)
            return IdentExpression.load(valid);
        else
            return new InvalidIdentExpression(src);
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        return visitor.invalidIdent(this, this.text);
    }
}
