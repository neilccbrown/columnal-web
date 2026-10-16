// Port of xyz.columnal.transformations.expression.IfThenElseExpression (expressions module).
import type { ExpressionIdentifier } from "../../../anns/Annotations.js";
import type { JavaRandom } from "../../../java/JavaRandom.js";
import type { TableAndColumnRenames } from "../../../identifiers/id/TableAndColumnRenames.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import { TypeExp } from "../../../types/typeExp/TypeExps.js";
import { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import { IdentifierUtility } from "../../../utility/utility/IdentifierUtility.js";
import { Utility } from "../../../utility/utility/Utility.js";
import { BracketedStatus } from "./BracketedStatus.js";
import { CanonicalSpan } from "./CanonicalSpan.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import type { EvaluateState } from "./EvaluateState.js";
import { type AndExpression, type EqualExpression, Expression, ImplicitLambdaArg, NonOperatorExpression } from "./Expressions.js";
import type { TypeState } from "./TypeState.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";
import { ExpressionVisitorFlat } from "./visitor/ExpressionVisitorFlat.js";

/**
 * Really, this could be done in a match expression, but I suspect
 * that would confuse users.
 *
 * This *cannot* be done in an if function as originally planned,
 * because functions are eager in their arguments, and you want
 * to be lazy in the unused then/else part for situations like
 * if y <> 0 then x / y else 0
 */
export class IfThenElseExpression extends NonOperatorExpression
{
    private readonly ifLocation: CanonicalSpan;
    private readonly thenLocation: CanonicalSpan;
    private readonly elseLocation: CanonicalSpan;
    private readonly endLocation: CanonicalSpan;
    private readonly condition: Expression;
    private readonly thenExpression: Expression;
    private readonly elseExpression: Expression;

    public static unrecorded(condition: Expression, thenExpression: Expression, elseExpression: Expression): IfThenElseExpression
    {
        const dummy = new CanonicalSpan(0, 0);
        return new IfThenElseExpression(dummy, condition, dummy, thenExpression, dummy, elseExpression, dummy);
    }

    public constructor(ifLocation: CanonicalSpan, condition: Expression,
                                thenLocation: CanonicalSpan, thenExpression: Expression,
                                elseLocation: CanonicalSpan, elseExpression: Expression,
                                endLocation: CanonicalSpan)
    {
        super();
        this.ifLocation = ifLocation;
        this.thenLocation = thenLocation;
        this.elseLocation = elseLocation;
        this.endLocation = endLocation;
        this.condition = condition;
        this.thenExpression = thenExpression;
        this.elseExpression = elseExpression;
    }


    public override check(dataLookup: Expression.ColumnLookup, state: TypeState, _kind: Expression.ExpressionKind, _locationInfo: Expression.LocationInfo, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        const lambda = ImplicitLambdaArg.detectImplicitLambda(this, [this.condition, this.thenExpression, this.elseExpression], state, onError);
        state = lambda.getSecond();
        const checked = this.checkIfThenElse(dataLookup, state, onError);
        return checked === null ? null : checked.applyToType(lambda.getFirst());
    }

    private checkIfThenElse(dataLookup: Expression.ColumnLookup, state: TypeState, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        const conditionType = this.condition.check(dataLookup, state, Expression.ExpressionKind.EXPRESSION, Expression.LocationInfo.UNIT_DEFAULT, onError);
        if (conditionType === null)
            return null;
        if (onError.recordError(this.condition, TypeExp.unifyTypes(TypeExp.bool(this), conditionType.typeExp)) === null)
        {
            return null;
        }
        const thenType = this.thenExpression.check(dataLookup, conditionType.typeState, Expression.ExpressionKind.EXPRESSION, Expression.LocationInfo.UNIT_DEFAULT, onError);
        const elseType = this.elseExpression.check(dataLookup, state, Expression.ExpressionKind.EXPRESSION, Expression.LocationInfo.UNIT_DEFAULT, onError);
        if (thenType === null || elseType === null)
            return null;

        // We show a type mismatch between then and else as an error in the else clause, effectively assuming that the then is correct:
        return onError.recordTypeAndError(this, this.elseExpression, TypeExp.unifyTypes(thenType.typeExp, elseType.typeExp), state);
    }

    public override calculateValue(state: EvaluateState): Expression.ValueResult
    {
        const expressions = [this.condition, this.thenExpression, this.elseExpression];
        if (expressions.some(e => e instanceof ImplicitLambdaArg))
        {
            return ImplicitLambdaArg.makeImplicitFunction(this, expressions, state, s => this.getIfThenElseValue(s));
        }
        else
        {
            return this.getIfThenElseValue(state);
        }
    }

    private getIfThenElseValue(state: EvaluateState): Expression.ValueResult
    {
        const valueResults: Expression.ValueResult[] = [];
        const condValState = this.fetchSubExpression(this.condition, state, valueResults);
        const b = Utility.cast(condValState.value, Boolean);
        // We always return original state to outermost,
        // but then-branch gets state from condition:
        if (b)
        {
            const thenResult = this.fetchSubExpression(this.thenExpression, condValState.evaluateState, valueResults);
            return this.result(thenResult.value, state, [condValState, thenResult]);
        }
        else
        {
            // Else gets original state, condition didn't pass:
            const elseResult = this.fetchSubExpression(this.elseExpression,state, valueResults);
            return this.result(elseResult.value, state, [condValState, elseResult]);
        }
    }

    public override save(saveDestination: Expression.SaveDestination, _surround: BracketedStatus, renames: TableAndColumnRenames): string
    {
        const patternVars = new Set(IfThenElseExpression.findPatternVars(this.condition));

        const definedVars = new Set(saveDestination.definedNames("var").map(v => v[0]!));
        const thenSave = saveDestination.withNames([...patternVars].filter(v => !definedVars.has(v)).flatMap(v => Utility.streamNullable(IdentifierUtility.asExpressionIdentifier(v))).map(v => new Pair<ExpressionIdentifier | null, readonly ExpressionIdentifier[]>("var", [v])));


        const content = "@if " + this.condition.save(saveDestination, BracketedStatus.DONT_NEED_BRACKETS, renames) + " @then " + this.thenExpression.save(thenSave, BracketedStatus.DONT_NEED_BRACKETS, renames) + " @else " + this.elseExpression.save(saveDestination, BracketedStatus.DONT_NEED_BRACKETS, renames) + " @endif";
        return content;
    }

    private static findPatternVars(conditionPart: Expression): string[]
    {
        return conditionPart.visit(new class extends ExpressionVisitorFlat<string[]>
        {
            // Only ands of equal expressions with patterns:
            public override and(_self: AndExpression, expressions: readonly Expression[]): string[]
            {
                return expressions.flatMap(e => IfThenElseExpression.findPatternVars(e));
            }

            public override equal(_self: EqualExpression, expressions: readonly Expression[], lastIsPattern: boolean): string[]
            {
                if (lastIsPattern)
                {
                    return expressions[1]!.allVariableReferences();
                }
                return [];
            }

            protected override makeDef(_expression: Expression): string[]
            {
                return [];
            }
        }());
    }

    public override toDisplay(displayType: Expression.DisplayType, _surround: BracketedStatus, expressionStyler: Expression.ExpressionStyler): StyledString
    {
        const content = StyledString.concat(
            StyledString.s("@if "),
            this.condition.toDisplay(displayType, BracketedStatus.DONT_NEED_BRACKETS, expressionStyler),
            StyledString.s(" @then "),
            this.thenExpression.toDisplay(displayType, BracketedStatus.DONT_NEED_BRACKETS, expressionStyler),
            StyledString.s(" @else "),
            this.elseExpression.toDisplay(displayType, BracketedStatus.DONT_NEED_BRACKETS, expressionStyler),
            StyledString.s(" @endif"),
        );
        return expressionStyler(content, this); //surround != BracketedStatus.NEED_BRACKETS ? content : StyledString.roundBracket(content);
    }


    public override _test_childMutationPoints(): Pair<Expression, (e: Expression) => Expression>[]
    {
        return []; // TODO
    }

    public override _test_typeFailure(_r: JavaRandom, _newExpressionOfDifferentType: Expression._test_TypeVary, _unitManager: UnitManager): Expression | null
    {
        return null; // TODO
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof IfThenElseExpression) || o.constructor !== this.constructor) return false;

        const that = o;

        if (!this.condition.equals(that.condition)) return false;
        if (!this.thenExpression.equals(that.thenExpression)) return false;
        return this.elseExpression.equals(that.elseExpression);
    }

    public override hashCode(): number
    {
        let result = this.condition.hashCode();
        result = (Math.imul(31, result) + this.thenExpression.hashCode()) | 0;
        result = (Math.imul(31, result) + this.elseExpression.hashCode()) | 0;
        return result;
    }

    public override replaceSubExpression(toReplace: Expression, replaceWith: Expression): Expression
    {
        if (this === toReplace)
            return replaceWith;
        else
            return IfThenElseExpression.unrecorded(
                this.condition.replaceSubExpression(toReplace, replaceWith),
                this.thenExpression.replaceSubExpression(toReplace, replaceWith),
                this.elseExpression.replaceSubExpression(toReplace, replaceWith),
            );
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        return visitor.ifThenElse(this, this.condition, this.thenExpression, this.elseExpression);
    }

    public getThenLocation(): CanonicalSpan
    {
        return this.thenLocation;
    }

    public getElseLocation(): CanonicalSpan
    {
        return this.elseLocation;
    }

    public getEndIfLocation(): CanonicalSpan
    {
        return this.endLocation;
    }

    public _getIfLocation(): CanonicalSpan
    {
        return this.ifLocation;
    }
}
