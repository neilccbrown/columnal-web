// Port of xyz.columnal.transformations.expression.NaryOpExpression (expressions module).
import { HashMap, type ReadonlyMapLike } from "../../../java/HashMap.js";
import { javaEquals, javaHashCode } from "../../../java/JavaObject.js";
import type { TableAndColumnRenames } from "../../../identifiers/id/TableAndColumnRenames.js";
import { TypeExp } from "../../../types/typeExp/TypeExps.js";
import { Either } from "../../../utility-adt/utility/adt/Either.js";
import { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import { Utility } from "../../../utility/utility/Utility.js";
import { BracketedStatus } from "./BracketedStatus.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import type { ExplanationLocation } from "./explanation/ExplanationLocation.js";
import { Expression, ImplicitLambdaArg } from "./Expressions.js";
import type { QuickFix } from "./QuickFix.js";
import type { TypeState } from "./TypeState.js";

/**
 * Created by neil on 29/11/2016.
 */
export abstract class NaryOpExpression extends Expression
{
    protected readonly expressions: readonly Expression[];

    protected booleanExplanation: readonly ExplanationLocation[] | null = null;

    public constructor(expressions: readonly Expression[])
    {
        super();
        this.expressions = [...expressions];
    }

    public override check(dataLookup: Expression.ColumnLookup, typeState: TypeState, kind: Expression.ExpressionKind, _locationInfo: Expression.LocationInfo, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        const lambda = ImplicitLambdaArg.detectImplicitLambda(this, this.expressions, typeState, onError);
        typeState = lambda.getSecond();
        const checked = this.checkNaryOp(dataLookup, typeState, kind, onError);
        return checked === null ? null : checked.applyToType(lambda.getFirst());
    }

    public abstract checkNaryOp(dataLookup: Expression.ColumnLookup, typeState: TypeState, kind: Expression.ExpressionKind, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null;

    // Will be same length as expressions, if null use existing
    public copy(replacements: readonly (Expression | null)[]): NaryOpExpression
    {
        const newExps: Expression[] = [];
        for (let i = 0; i < this.expressions.length; i++)
        {
            const newExp = replacements[i] ?? null;
            newExps.push(newExp !== null ? newExp : this.expressions[i]!);
        }
        return this.copyNoNull(newExps);
    }

    public abstract copyNoNull(replacements: readonly Expression[]): NaryOpExpression;

    public override replaceSubExpression(toReplace: Expression, replaceWith: Expression): Expression
    {
        if (this === toReplace)
            return replaceWith;
        else
            return this.copyNoNull(Utility.mapList(this.expressions, e => e.replaceSubExpression(toReplace, replaceWith)));
    }

    public override save(saveDestination: Expression.SaveDestination, surround: BracketedStatus, renames: TableAndColumnRenames): string
    {
        let s = surround === BracketedStatus.NEED_BRACKETS ? "(" : "";
        s += this.getSpecialPrefix();
        for (let i = 0; i < this.expressions.length; i++)
        {
            if (i > 0)
                s += " " + this.saveOp(i - 1) + " ";
            s += this.expressions[i]!.save(saveDestination, BracketedStatus.NEED_BRACKETS, renames);
        }
        if (surround === BracketedStatus.NEED_BRACKETS)
            s += ")";
        return s;
    }

    public override toDisplay(displayType: Expression.DisplayType, surround: BracketedStatus, expressionStyler: Expression.ExpressionStyler): StyledString
    {
        const s = new StyledString.Builder();
        s.append(surround === BracketedStatus.NEED_BRACKETS ? "(" : "");
        for (let i = 0; i < this.expressions.length; i++)
        {
            if (i > 0)
                s.append(" ").append(this.saveOp(i - 1)).append(" ");
            s.append(this.expressions[i]!.toDisplay(displayType, BracketedStatus.NEED_BRACKETS, expressionStyler));
        }
        if (surround === BracketedStatus.NEED_BRACKETS)
            s.append(")");
        return expressionStyler(s.build(), this);
    }

    // Can be overridden by child classes to insert prefix before expression
    protected getSpecialPrefix(): string
    {
        return "";
    }

    protected abstract saveOp(index: number): string;

    public override _test_childMutationPoints(): Pair<Expression, (e: Expression) => Expression>[]
    {
        return this.expressions.flatMap((e, i) =>
            e._test_allMutationPoints().map(p => new Pair<Expression, (e: Expression) => Expression>(p.getFirst(), (exp: Expression) => this.copy(this.makeNullList(i, p.getSecond()(exp))))));
    }

    protected makeNullList(index: number, newExp: Expression): (Expression | null)[]
    {
        if (index < 0 || index >= this.expressions.length)
            throw new Error("makeNullList invalid " + index + " compared to " + this.expressions.length);
        const r: (Expression | null)[] = [];
        for (let i = 0; i < this.expressions.length; i++)
        {
            r.push(i === index ? newExp : null);
        }
        return r;
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof NaryOpExpression) || o.constructor !== this.constructor) return false;

        const that = o;

        if (!javaEquals(this.getOpList(), that.getOpList())) return false;
        return javaEquals(this.expressions, that.expressions);
    }

    public override hashCode(): number
    {
        return (javaHashCode(this.expressions) + Math.imul(31, javaHashCode(this.getOpList()))) | 0;
    }

    public getChildren(): readonly Expression[]
    {
        return this.expressions;
    }

    // Can be overriden by subclasses if needed:
    public _test_getOperatorEntry(index: number): string
    {
        return this.saveOp(index);
    }

    private getOpList(): string[]
    {
        const r: string[] = [];
        for (let i = 0; i < this.expressions.length - 1; i++)
        {
            r.push(this.saveOp(i));
        }
        return r;
    }

    public checkAllOperandsSameTypeAndNotPatterns(target: TypeExp, data: Expression.ColumnLookup, state: TypeState, locationInfo: Expression.LocationInfo, onError: ErrorAndTypeRecorder, getCustomErrorAndFix: NaryOpExpression.CustomError): TypeExp | null
    {
        let allValid = true;
        const unificationOutcomes: (Pair<TypeExp.TypeError | null, TypeExp> | null)[] = [];
        for (const expression of this.expressions)
        {
            const type = expression.check(data, state, Expression.ExpressionKind.EXPRESSION, locationInfo, onError);

            // Make sure to execute always (don't use short-circuit and with allValid):
            if (type === null)
            {
                allValid = false;
                unificationOutcomes.push(null);
            }
            else
            {
                const unified = TypeExp.unifyTypes(target, type.typeExp);
                // We have to recreate either to add nullable constraint:
                unificationOutcomes.push(new Pair(unified.either<TypeExp.TypeError | null>(err => err, _u => null), type.typeExp));
                if (unified.isLeft())
                    allValid = false;
            }
        }

        const expressionTypes: (TypeExp | null)[] = unificationOutcomes.map(p => p === null ? null : p.getSecond());

        if (!allValid)
        {
            for (let i = 0; i < this.expressions.length; i++)
            {
                const expression = this.expressions[i]!;
                const customErrors = getCustomErrorAndFix(new NaryOpExpression.TypeProblemDetails(expressionTypes, this.expressions, i));
                const outcome = unificationOutcomes[i]!;
                const unifyError = outcome !== null ? outcome.getFirst() : null;
                let recordedCustomError = false;
                for (const [key, value] of customErrors)
                {
                    const customError = value.getFirst();
                    if (customError !== null)
                    {
                        onError.recordError(key, Either.left<TypeExp.TypeError | null, TypeExp>(customError));
                        recordedCustomError = true;
                    }
                    else if (value.getSecond().length !== 0 && (key !== expression || unifyError !== null))
                    {
                        // Hack to ensure there is an error:
                        onError.recordError(key, StyledString.s(" "));
                        recordedCustomError = true;
                    }
                    if (value.getSecond().length !== 0)
                        onError.recordQuickFixes(key, value.getSecond());
                }

                if (!recordedCustomError && unifyError !== null)
                    onError.recordError(expression, unifyError.getMessage());
            }
        }

        return allValid ? target : null;
    }
}

export namespace NaryOpExpression
{
    export class TypeProblemDetails
    {
        // Same length as expressions.  (Java: ImmutableList<Optional<TypeExp>>)
        private readonly expressionTypes: readonly (TypeExp | null)[];
        public readonly expressions: readonly Expression[];
        public readonly index: number;

        public constructor(expressionTypes: readonly (TypeExp | null)[], expressions: readonly Expression[], index: number)
        {
            this.expressionTypes = expressionTypes;
            this.expressions = expressions;
            this.index = index;
        }

        public getOurType(): TypeExp | null
        {
            return this.getType(this.index);
        }

        public getType(index: number): TypeExp | null
        {
            return this.expressionTypes[index]!;
        }

        public getOurExpression(): Expression
        {
            return this.expressions[this.index]!;
        }

        public getAvailableTypesForError(): TypeExp[]
        {
            return this.expressionTypes.flatMap(t => Utility.streamNullable(t));
        }
    }

    // Java: ImmutableMap<@Recorded Expression, ...>, keyed by Expression.equals
    export type CustomError = (typeProblemDetails: TypeProblemDetails) => ReadonlyMapLike<Expression, Pair<TypeExp.TypeError | null, readonly QuickFix<Expression>[]>>;

    /** Java: ImmutableMap.of(...) for a CustomError result */
    export function customErrors(...entries: [Expression, Pair<TypeExp.TypeError | null, readonly QuickFix<Expression>[]>][]): ReadonlyMapLike<Expression, Pair<TypeExp.TypeError | null, readonly QuickFix<Expression>[]>>
    {
        const m = new HashMap<Expression, Pair<TypeExp.TypeError | null, readonly QuickFix<Expression>[]>>();
        for (const [k, v] of entries)
        {
            if (m.has(k))
                throw new Error("IllegalArgumentException: Multiple entries with same key: " + k.toString());
            m.set(k, v);
        }
        return m;
    }
}
