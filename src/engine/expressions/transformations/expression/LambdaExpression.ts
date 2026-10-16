// Port of xyz.columnal.transformations.expression.LambdaExpression (expressions module).
import { javaEquals, javaObjectsHash } from "../../../java/JavaObject.js";
import type { JavaRandom } from "../../../java/JavaRandom.js";
import type { TableAndColumnRenames } from "../../../identifiers/id/TableAndColumnRenames.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import { TypeExp } from "../../../types/typeExp/TypeExps.js";
import type { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import { Utility } from "../../../utility/utility/Utility.js";
import type { Value } from "../../../utility/utility/Value.js";
import { BracketedStatus } from "./BracketedStatus.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import type { EvaluateState } from "./EvaluateState.js";
import { Explanation } from "./explanation/Explanation.js";
import { Expression } from "./Expressions.js";
import { ValueFunction } from "./function/ValueFunction.js";
import type { TypeState } from "./TypeState.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";

export class LambdaExpression extends Expression
{
    private readonly parameters: readonly Expression[];
    private readonly body: Expression;

    public constructor(parameters: readonly Expression[], body: Expression)
    {
        super();
        this.parameters = parameters;
        this.body = body;
    }

    public override check(dataLookup: Expression.ColumnLookup, original: TypeState, _kind: Expression.ExpressionKind, _locationInfo: Expression.LocationInfo, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        const paramTypes: TypeExp[] = [];

        let typeState = original;

        for (const parameter of this.parameters)
        {
            const checkedExp = parameter.check(dataLookup, typeState, Expression.ExpressionKind.PATTERN, Expression.LocationInfo.UNIT_DEFAULT, onError);
            if (checkedExp === null)
                return null;
            paramTypes.push(checkedExp.typeExp);
            typeState = checkedExp.typeState;
        }

        const returnType = this.body.check(dataLookup, typeState, Expression.ExpressionKind.EXPRESSION, Expression.LocationInfo.UNIT_DEFAULT, onError);
        if (returnType === null)
            return null;

        return new Expression.CheckedExp(onError.recordTypeNN(this, TypeExp.function(this, [...paramTypes], returnType.typeExp)), original);
    }

    public override calculateValue(original: EvaluateState): Expression.ValueResult
    {
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- the inner class's outer instance
        const outer = this;
        const valueFunction: ValueFunction = new class extends ValueFunction
        {
            public constructor()
            {
                super();
            }

            protected override _call(): Value
            {
            let state = original;
            const args: Expression.ValueResult[] = [];
            for (let i = 0; i < outer.parameters.length; i++)
            {
                const result = outer.matchSubExpressionAsPattern(outer.parameters[i]!, this.arg(i), state, args);
                state = result.evaluateState;
            }
            const bodyOutcome = outer.fetchSubExpression(outer.body, state, args);
            this.addExtraExplanation(() => bodyOutcome.makeExplanation(Explanation.ExecutionType.VALUE));
            return bodyOutcome.value;
            }
        }();

        return this.explanation(ValueFunction.value(valueFunction), Explanation.ExecutionType.VALUE, original, [], [], false);
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        return visitor.lambda(this, this.parameters, this.body);
    }

    public override save(saveDestination: Expression.SaveDestination, _surround: BracketedStatus, renames: TableAndColumnRenames): string
    {
        const params = this.parameters.map(e => e.save(saveDestination, BracketedStatus.DONT_NEED_BRACKETS, renames)).join(", ");
        const body = this.body.save(saveDestination, BracketedStatus.DONT_NEED_BRACKETS, renames);
        if (saveDestination.needKeywords())
            return "@function(" + params + ") @then " + body + "@endfunction";
        else
            return "@function" + params + " @then " + body + "@endfunction";
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
        if (!(o instanceof LambdaExpression) || o.constructor !== this.constructor) return false;
        const that = o;
        return javaEquals(this.parameters, that.parameters) &&
                this.body.equals(that.body);
    }

    public override hashCode(): number
    {
        return javaObjectsHash(this.parameters, this.body);
    }

    public override toDisplay(displayType: Expression.DisplayType, _bracketedStatus: BracketedStatus, expressionStyler: Expression.ExpressionStyler): StyledString
    {
        return expressionStyler(StyledString.concat(
            StyledString.s("@function("),
            StyledString.joining(this.parameters.map(e => e.toDisplay(displayType, BracketedStatus.DONT_NEED_BRACKETS, expressionStyler)), ", "),
            StyledString.s(") @then "),
            this.body.toDisplay(displayType, BracketedStatus.DONT_NEED_BRACKETS, expressionStyler),
            StyledString.s(" @endfunction"),
        ), this);
    }

    public override replaceSubExpression(toReplace: Expression, replaceWith: Expression): Expression
    {
        if (this === toReplace)
            return replaceWith;
        else
            return new LambdaExpression(Utility.mapListI(this.parameters, e => e.replaceSubExpression(toReplace, replaceWith)), this.body.replaceSubExpression(toReplace, replaceWith));
    }
}
