// Port of xyz.columnal.transformations.expression.ImplicitLambdaArg (expressions module).
import type { JavaRandom } from "../../../java/JavaRandom.js";
import type { TableAndColumnRenames } from "../../../identifiers/id/TableAndColumnRenames.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import { MutVar, TypeExp } from "../../../types/typeExp/TypeExps.js";
import { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../utility-error/error/InternalException.js";
import { UserException } from "../../../utility-error/error/UserException.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import { Utility } from "../../../utility/utility/Utility.js";
import type { Value } from "../../../utility/utility/Value.js";
import type { BracketedStatus } from "./BracketedStatus.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import type { EvaluateState } from "./EvaluateState.js";
import { Explanation } from "./explanation/Explanation.js";
import { type Expression, NonOperatorExpression } from "./Expressions.js";
import { ValueFunction } from "./function/ValueFunction.js";
import type { TypeState } from "./TypeState.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";

/**
 * The question mark that makes an implicit lambda, e.g. in ? < 5
 */
export class ImplicitLambdaArg extends NonOperatorExpression
{
    private id = -1;

    public constructor()
    {
        super();
    }

    public override check(_dataLookup: Expression.ColumnLookup, typeState: TypeState, _kind: Expression.ExpressionKind, _locationInfo: Expression.LocationInfo, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        this.assignId(typeState);
        const questTypes = typeState.findVarType(this.getVarName());
        if (questTypes === null || questTypes.length === 0)
            throw new UserException("? is not a valid expression by itself");
        // Pick last one in case of nested definitions:
        return onError.recordType(this, typeState, questTypes[questTypes.length - 1]!);
    }

    // Java: protected (called from TypeState, in the same package)
    public assignId(typeState: TypeState): void
    {
        if (this.id < 0)
            this.id = typeState.getNextLambdaId();
    }

    // Java: protected (called from TypeState, in the same package)
    public getVarName(): string
    {
        if (this.id < 0)
            throw new InternalException("Implicit lambda used without being typechecked first");
        return "?" + this.id;
    }

    // Java: protected (called from Expression, in the same package)
    public getVarNameOrNull(): string | null
    {
        if (this.id < 0)
            return null;
        return "?" + this.id;
    }

    public override calculateValue(state: EvaluateState): Expression.ValueResult
    {
        return this.result(state.get(this.getVarName()), state);
    }

    public override save(_saveDestination: Expression.SaveDestination, _surround: BracketedStatus, _renames: TableAndColumnRenames): string
    {
        return "?";
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
        return o instanceof ImplicitLambdaArg;
    }

    public override hashCode(): number
    {
        return 1;
    }

    public override toDisplay(_displayType: Expression.DisplayType, _bracketedStatus: BracketedStatus, expressionStyler: Expression.ExpressionStyler): StyledString
    {
        return expressionStyler(StyledString.s("?"), this);
    }

    // If any of the list are implicit lambda args ('?'), returns a new type state
    // with a type for '?' and a wrap function which will turn the item into a function.
    // If none are, returns null and unaltered type state.
    public static detectImplicitLambda(src: Expression, args: readonly Expression[], typeState: TypeState, errorAndTypeRecorder: ErrorAndTypeRecorder): Pair<((t: TypeExp) => TypeExp) | null, TypeState>
    {
        const lambdaArgs = ImplicitLambdaArg.getLambdaArgsFrom(args);

        if (lambdaArgs.length !== 0)
        {
            const argTypes: TypeExp[] = Utility.mapListI(lambdaArgs, arg => new MutVar(arg));
            return new Pair<((t: TypeExp) => TypeExp) | null, TypeState>(t => errorAndTypeRecorder.recordTypeNN(src, TypeExp.function(src, argTypes, t)), typeState.addImplicitLambdas(lambdaArgs, argTypes));
        }
        else
        {
            return new Pair<((t: TypeExp) => TypeExp) | null, TypeState>(null, typeState);
        }
    }

    /**
     * Given a list which may contain one or more implicit
     * arguments, form a function which takes a tuple of
     * them as arguments and stores them in evaluate state
     * before calling the given body.
     * If no lambda args present, calls body directly.
     *
     * @param possibleArgs A list, some of which may be implicitlambdaarg (but not all)
     * @param body
     * @return
     */
    public static makeImplicitFunction(outer: Expression, possibleArgs: readonly Expression[], state: EvaluateState, body: ImplicitLambdaArg.ImplicitLambdaFunction<EvaluateState, Expression.ValueResult>): Expression.ValueResult
    {
        const lambdaArgs = ImplicitLambdaArg.getLambdaArgsFrom(possibleArgs);
        if (lambdaArgs.length === 0)
        {
            // Not an implicit lambda, we shouldn't have been called,
            // but there is a sensible result to give:
            return body(state);
        }
        else
        {
            // Takes one or more parameters:
            return outer.explanation(ValueFunction.value(new class extends ValueFunction
            {
                public constructor()
                {
                    super();
                }

                public override _call(): Value
                {
                    let argState = state;
                    for (let i = 0; i < lambdaArgs.length; i++)
                    {
                        argState = argState.add(lambdaArgs[i]!.getVarName(), this.arg(i));
                    }
                    const r = body(argState);
                    this.addExtraExplanation(() => r.makeExplanation(Explanation.ExecutionType.CALL_IMPLICIT));
                    return r.value;
                }
            }()), Explanation.ExecutionType.VALUE, state, [], [], false);
        }
    }

    public static getLambdaArgsFrom(possibleArgs: readonly Expression[]): ImplicitLambdaArg[]
    {
        return Utility.filterClass(possibleArgs, ImplicitLambdaArg);
    }

    public override replaceSubExpression(toReplace: Expression, replaceWith: Expression): Expression
    {
        return this === toReplace ? replaceWith : this;
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        return visitor.implicitLambdaArg(this);
    }
}

export namespace ImplicitLambdaArg
{
    export type ImplicitLambdaFunction<T, R> = (t: T) => R;
}
