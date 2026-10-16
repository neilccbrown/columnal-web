// Port of xyz.columnal.transformations.expression.MatchExpression (expressions module).
import { javaEquals, javaHashCode } from "../../../java/JavaObject.js";
import type { JavaRandom } from "../../../java/JavaRandom.js";
import { TableAndColumnRenames } from "../../../identifiers/id/TableAndColumnRenames.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import { TypeExp } from "../../../types/typeExp/TypeExps.js";
import { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { UserException } from "../../../utility-error/error/UserException.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import { Utility } from "../../../utility/utility/Utility.js";
import type { Value } from "../../../utility/utility/Value.js";
import { BracketedStatus } from "./BracketedStatus.js";
import { CanonicalSpan } from "./CanonicalSpan.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import type { EvaluateState } from "./EvaluateState.js";
import { EvaluationException } from "./EvaluationException.js";
import { Explanation, type ReadonlySetLike } from "./explanation/Explanation.js";
import type { ExplanationLocation } from "./explanation/ExplanationLocation.js";
import { Expression, NaryOpExpression, NonOperatorExpression } from "./Expressions.js";
import { ExpressionUtil } from "./ExpressionUtil.js";
import { TypeState } from "./TypeState.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";

/**
 * Created by neil on 28/11/2016.
 */
export class MatchExpression extends NonOperatorExpression
{
    private readonly matchLocation: CanonicalSpan;
    private readonly expression: Expression;
    private readonly clauses: readonly MatchExpression.MatchClause[];
    private readonly endLocation: CanonicalSpan;

    public constructor(matchLocation: CanonicalSpan, expression: Expression, clauses: readonly MatchExpression.MatchClause[], endLocation: CanonicalSpan)
    {
        super();
        this.matchLocation = matchLocation;
        this.expression = expression;
        this.clauses = clauses;
        this.endLocation = endLocation;
    }

    public getExpression(): Expression
    {
        return this.expression;
    }

    public getClauses(): readonly MatchExpression.MatchClause[]
    {
        return this.clauses;
    }

    public override calculateValue(state: EvaluateState): Expression.ValueResult
    {
        const subItems: Expression.ValueResult[] = [];
        // It's type checked so can just copy first clause:
        const originalResult = this.fetchSubExpression(this.expression, state, subItems);
        const value = originalResult.value;
        for (const clause of this.clauses)
        {
            let patternMatch: Expression.ValueResult;
            try
            {
                patternMatch = clause.matches(value, state);
                subItems.push(patternMatch);
            }
            catch (e)
            {
                if (!(e instanceof EvaluationException))
                    throw e;
                throw new EvaluationException(e, this, Explanation.ExecutionType.MATCH, state, [...subItems]);
            }
            if (Utility.cast(patternMatch.value, Boolean))
            {
                const clauseOutcomeResult = this.fetchSubExpression(clause.getOutcome(), patternMatch.evaluateState,subItems);
                return this.result(clauseOutcomeResult.value, state, [...subItems]);
            }
        }
        throw new EvaluationException(new UserException("No matching clause found in expression: \"" + this.save(Expression.SaveDestination.TO_STRING, BracketedStatus.NEED_BRACKETS, TableAndColumnRenames.EMPTY) + "\""), this, Explanation.ExecutionType.MATCH, state, [...subItems]);
    }

    public override save(saveDestination: Expression.SaveDestination, surround: BracketedStatus, renames: TableAndColumnRenames): string
    {
        const inner = "@match " + this.expression.save(saveDestination, BracketedStatus.DONT_NEED_BRACKETS, renames) + this.clauses.map(c => c.save(saveDestination, renames)).join("") + " @endmatch";
        return (surround === BracketedStatus.DONT_NEED_BRACKETS) ? inner : ("(" + inner + ")");
    }

    public override toDisplay(displayType: Expression.DisplayType, _surround: BracketedStatus, expressionStyler: Expression.ExpressionStyler): StyledString
    {
        const inner = StyledString.concat(StyledString.s("@match "), this.expression.toDisplay(displayType, BracketedStatus.DONT_NEED_BRACKETS, expressionStyler), StyledString.joining(this.clauses.map(c => c.toDisplay(displayType, expressionStyler)), ""), StyledString.s(" @endmatch"));
        return expressionStyler(inner, this); //(surround == BracketedStatus.DIRECT_ROUND_BRACKETED || surround == BracketedStatus.DONT_NEED_BRACKETS) ? inner : StyledString.roundBracket(inner);
    }

    public override check(dataLookup: Expression.ColumnLookup, state: TypeState, _kind: Expression.ExpressionKind, _locationInfo: Expression.LocationInfo, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        // Need to check several things:
        //   - That all of the patterns have the same type as the expression being matched
        //   - That all of the pattern guards have boolean type
        //   - That all of the outcome expressions have the same type as each other (and is what we will return)

        const srcType = this.expression.check(dataLookup, state, Expression.ExpressionKind.EXPRESSION, Expression.LocationInfo.UNIT_DEFAULT, onError);
        if (srcType === null)
            return null;
        // The Equatable checks are done on the patterns, not the source item, because e.g. if all patterns match
        // certain tuple item as @anything, we don't need Equatable on that value.

        if (this.clauses.length === 0)
        {
            onError.recordError(this, StyledString.s("Must have at least one clause in a match"));
            return null;
        }

        // Add one extra for the srcType.  This size will be wrong if a clause
        // has multiple patterns, but it's only a hint.
        const patternTypes: TypeExp[] = [];
        const outcomeTypes: TypeExp[] = new Array<TypeExp>(this.clauses.length);
        // Includes the original source pattern:
        const patternExpressions: Expression[] = [];
        // Note: patternTypes and patternExpressions should always be the same length.
        patternTypes.push(srcType.typeExp);
        patternExpressions.push(this.expression);

        for (let i = 0; i < this.clauses.length; i++)
        {
            patternExpressions.push(...Utility.mapList(this.clauses[i]!.getPatterns(), p => p.getPattern()));
            const patternAndOutcomeType = this.clauses[i]!.check(dataLookup, state, onError);
            if (patternAndOutcomeType === null)
                return null;
            patternTypes.push(...patternAndOutcomeType.getFirst());
            outcomeTypes[i] = patternAndOutcomeType.getSecond();
        }
        const immPatternExpressions = [...patternExpressions];

        for (let i = 0; i < immPatternExpressions.length; i++)
        {
            const expression = immPatternExpressions[i]!;
            const fixesForMatchingNumericUnits = ExpressionUtil.getFixesForMatchingNumericUnits(state, new NaryOpExpression.TypeProblemDetails([...patternTypes], immPatternExpressions, i));
            if (fixesForMatchingNumericUnits.length !== 0)
            {
                // Must show an error to get the quick fixes to show:
                onError.recordError(expression, StyledString.s("Pattern match items must have matching items"));
                onError.recordQuickFixes(expression, fixesForMatchingNumericUnits);
            }
        }

        if (onError.recordError(this, TypeExp.unifyTypes(patternTypes)) === null)
            return null;

        // TypeState doesn't extend outside the match expression, so we discard and return original:
        return onError.recordTypeAndError(this, TypeExp.unifyTypes(outcomeTypes), state);
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof MatchExpression) || o.constructor !== this.constructor) return false;

        const that = o;

        if (!this.expression.equals(that.expression)) return false;
        return javaEquals(this.clauses, that.clauses);

    }

    public override hashCode(): number
    {
        let result = this.expression.hashCode();
        result = (Math.imul(31, result) + javaHashCode(this.clauses)) | 0;
        return result;
    }

    public override _test_childMutationPoints(): Pair<Expression, (e: Expression) => Expression>[]
    {
        // TODO allow replacement within clauses
        return this.expression._test_allMutationPoints().map(p => new Pair<Expression, (e: Expression) => Expression>(p.getFirst(), e => new MatchExpression(new CanonicalSpan(0, 0), p.getSecond()(e), Utility.mapListI(this.clauses, c => c._test_copy()), new CanonicalSpan(0, 0))));
    }

    public override _test_typeFailure(_r: JavaRandom, _newExpressionOfDifferentType: Expression._test_TypeVary, _unitManager: UnitManager): Expression | null
    {
        return null;
    }

    public override replaceSubExpression(toReplace: Expression, replaceWith: Expression): Expression
    {
        if (toReplace === this)
            return replaceWith;
        else
            return new MatchExpression(new CanonicalSpan(0, 0), this.expression.replaceSubExpression(toReplace, replaceWith), Utility.mapListI(this.clauses, c => c.replaceSubExpression(toReplace, replaceWith)), new CanonicalSpan(0, 0));
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        return visitor.match(this, this.expression, this.clauses);
    }

    public getEndLocation(): CanonicalSpan
    {
        return this.endLocation;
    }

    public _getMatchLocation(): CanonicalSpan
    {
        return this.matchLocation;
    }
}

export namespace MatchExpression
{
    /**
     * A clause is a list of patterns, and an outcome expression
     */
    export class MatchClause implements Explanation.ExplanationSource
    {
        private readonly caseLocation: CanonicalSpan;
        private readonly patterns: readonly Pattern[];
        private readonly outcome: Expression;

        public constructor(caseLocation: CanonicalSpan, patterns: readonly Pattern[], outcome: Expression)
        {
            this.caseLocation = caseLocation;
            this.patterns = patterns;
            this.outcome = outcome;
        }

        public static unrecorded(patterns: readonly Pattern[], outcome: Expression): MatchClause
        {
            return new MatchClause(new CanonicalSpan(0, 0), patterns, outcome);
        }

        public getPatterns(): readonly Pattern[]
        {
            return this.patterns;
        }

        public getOutcome(): Expression
        {
            return this.outcome;
        }

        public allVariableReferences(): string[]
        {
            return [...this.patterns.flatMap(p => p.allVariableReferences()), ...this.outcome.allVariableReferences()];
        }

        /**
         * Returns pattern match type, outcome type
         */
        public check(data: Expression.ColumnLookup, state: TypeState, onError: ErrorAndTypeRecorder): Pair<TypeExp[], TypeExp> | null
        {
            const patternTypes: TypeExp[] = new Array<TypeExp>(this.patterns.length);
            const rhsStates: TypeState[] = new Array<TypeState>(this.patterns.length);
            if (this.patterns.length === 0)
            {
                // Probably a test generation error:
                throw new UserException("Clause with no patterns");
            }
            for (let i = 0; i < this.patterns.length; i++)
            {
                const ts = this.patterns[i]!.check(data, state, onError);
                if (ts === null)
                    return null;
                patternTypes[i] = ts.typeExp;
                rhsStates[i] = ts.typeState;
            }
            const rhsState = TypeState.intersect(rhsStates);
            const outcomeType = this.outcome.check(data, rhsState, Expression.ExpressionKind.EXPRESSION, Expression.LocationInfo.UNIT_DEFAULT, onError);
            if (outcomeType === null)
                return null;
            else
                return new Pair(patternTypes, outcomeType.typeExp);
        }

        //Returns null if no match
        public matches(value: Value, state: EvaluateState): Expression.ValueResult
        {
            const patternsSoFar: Expression.ValueResult[] = [];
            for (let i = 0; i < this.patterns.length; i++)
            {
                const p = this.patterns[i]!;
                const matches = p.match(value, state);
                patternsSoFar.push(...matches);
                const patternOutcome = matches[matches.length - 1]!;
                if (Utility.cast(patternOutcome.value, Boolean)) // Did it match?
                    return this.result(i, patternOutcome.evaluateState, [...patternsSoFar]);
            }
            return this.result(null, state, [...patternsSoFar]);
        }

        // Java: matchedPatternIndex is an OptionalInt
        private result(matchedPatternIndex: number | null, state: EvaluateState, children: readonly Expression.ValueResult[]): Expression.ValueResult
        {
            // eslint-disable-next-line @typescript-eslint/no-this-alias -- the inner class's outer instance
            const outer = this;
            return new class extends Expression.ValueResult
            {
                public override makeExplanation(overrideExecutionType: Explanation.ExecutionType | null): Explanation
                {
                    return new class extends Explanation
                    {
                        public override describe(_alreadyDescribed: ReadonlySetLike<Explanation>, _hyperlinkLocation: (location: ExplanationLocation) => StyledString, _expressionStyler: Expression.ExpressionStyler, _extraLocations: readonly ExplanationLocation[], _skipIfTrivial: boolean): StyledString | null
                        {
                            // We only need to describe the patterns, if we are chosen
                            // then the outer MatchExpression will describe outcome.
                            // We know that all patterns before the last did not match
                            return null;
                        }

                        public override getDirectSubExplanations(): readonly Explanation[]
                        {
                            return Utility.mapListInt(children, c => c.makeExplanation(null));
                        }
                    }(outer, overrideExecutionType !== null ? overrideExecutionType : Explanation.ExecutionType.MATCH, this.evaluateState, this.value, [], null);
                }
            }(DataTypeUtility.value(matchedPatternIndex !== null), state);
        }

        public save(saveDestination: Expression.SaveDestination, renames: TableAndColumnRenames): string
        {
            return " @case " + this.patterns.map(p => p.save(saveDestination, renames)).join(" @orcase ") + " @then " + this.outcome.save(saveDestination, BracketedStatus.DONT_NEED_BRACKETS, renames);
        }

        public toDisplay(displayType: Expression.DisplayType, expressionStyler: Expression.ExpressionStyler): StyledString
        {
            return StyledString.concat(
                StyledString.s(" @case "),
                StyledString.joining(this.patterns.map(p => p.toDisplay(displayType, expressionStyler)), " or "),
                StyledString.s(" @then "),
                this.outcome.toDisplay(displayType, BracketedStatus.DONT_NEED_BRACKETS, expressionStyler),
            );
        }

        public toString(): string
        {
            return this.toDisplay(Expression.DisplayType.FULL, (s, _e) => s).toPlain();
        }

        public _test_copy(): MatchClause
        {
            return new MatchClause(new CanonicalSpan(0, 0), this.patterns, this.outcome); //TODO deep copy patterns
        }

        public equals(o: unknown): boolean
        {
            if (this === o) return true;
            if (!(o instanceof MatchClause) || o.constructor !== this.constructor) return false;

            const that = o;

            if (!javaEquals(this.patterns, that.patterns)) return false;
            return this.outcome.equals(that.outcome);

        }

        public hashCode(): number
        {
            let result = javaHashCode(this.patterns);
            result = (Math.imul(31, result) + this.outcome.hashCode()) | 0;
            return result;
        }

        public replaceSubExpression(toReplace: Expression, replaceWith: Expression): MatchClause
        {
            return new MatchClause(new CanonicalSpan(0, 0), Utility.mapListI(this.patterns, p => p.replaceSubExpression(toReplace, replaceWith)), this.outcome.replaceSubExpression(toReplace, replaceWith));
        }

        public getCaseLocation(): CanonicalSpan
        {
            return this.caseLocation;
        }
    }

    /**
     * A pattern is an expression, plus an optional guard
     */
    export class Pattern implements Explanation.ExplanationSource
    {
        private readonly pattern: Expression;
        private readonly guard: Expression | null;

        public constructor(pattern: Expression, guard: Expression | null)
        {
            this.pattern = pattern;
            this.guard = guard;
        }

        public allVariableReferences(): string[]
        {
            if (this.guard === null)
                return this.pattern.allVariableReferences();
            else
                return [...this.pattern.allVariableReferences(), ...this.guard.allVariableReferences()];
        }

        /**
         * Returns pattern type, and resulting type state (including any declared vars)
         */
        public check(data: Expression.ColumnLookup, state: TypeState, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
        {
            const rhsState = this.pattern.check(data, state, Expression.ExpressionKind.PATTERN, Expression.LocationInfo.UNIT_CONSTRAINED, onError);
            if (rhsState === null)
                return null;
            // No need to check expression versus pattern, either is fine, but we will require Equatable either way:
            rhsState.requireEquatable();

            if (this.guard !== null)
            {
                const type = this.guard.check(data, rhsState.typeState, Expression.ExpressionKind.EXPRESSION, Expression.LocationInfo.UNIT_DEFAULT, onError);
                if (type === null || onError.recordError(this.guard, TypeExp.unifyTypes(TypeExp.bool(this.guard), type.typeExp)) === null)
                {
                    return null;
                }
                return new Expression.CheckedExp(rhsState.typeExp, type.typeState);
            }
            return rhsState;
        }

        // Returns just pattern, or pattern + guard.
        // Either way, the real result is the one in last list item.
        public match(value: Value, state: EvaluateState): Expression.ValueResult[]
        {
            const patternOutcome = this.pattern.matchAsPattern(value, state);
            // Only check guard if initial match was valid:
            if (this.guard !== null && Utility.cast(patternOutcome.value, Boolean))
            {
                const guardOutcome = this.guard.calculateValue(patternOutcome.evaluateState);
                return [patternOutcome, guardOutcome];
            }
            return [patternOutcome];
        }

        public save(saveDestination: Expression.SaveDestination, renames: TableAndColumnRenames): string
        {
            return this.pattern.save(saveDestination, BracketedStatus.DONT_NEED_BRACKETS, renames) + (this.guard === null ? "" : " @given " + this.guard.save(saveDestination, BracketedStatus.DONT_NEED_BRACKETS, renames));
        }

        public toDisplay(displayType: Expression.DisplayType, expressionStyler: Expression.ExpressionStyler): StyledString
        {
            const patternDisplay = this.pattern.toDisplay(displayType, BracketedStatus.DONT_NEED_BRACKETS, expressionStyler);
            return this.guard === null ? patternDisplay : StyledString.concat(patternDisplay, StyledString.s(" @given "), this.guard.toDisplay(displayType, BracketedStatus.DONT_NEED_BRACKETS, expressionStyler));
        }

        public getPattern(): Expression
        {
            return this.pattern;
        }

        public equals(o: unknown): boolean
        {
            if (this === o) return true;
            if (!(o instanceof Pattern) || o.constructor !== this.constructor) return false;

            const pattern1 = o;

            if (!this.pattern.equals(pattern1.pattern)) return false;
            return this.guard !== null ? this.guard.equals(pattern1.guard) : pattern1.guard === null;
        }

        public hashCode(): number
        {
            let result = this.pattern.hashCode();
            result = (Math.imul(31, result) + (this.guard !== null ? this.guard.hashCode() : 0)) | 0;
            return result;
        }

        public getGuard(): Expression | null
        {
            return this.guard;
        }

        public replaceSubExpression(toReplace: Expression, replaceWith: Expression): Pattern
        {
            return new Pattern(this.pattern.replaceSubExpression(toReplace, replaceWith), this.guard === null ? null : this.guard.replaceSubExpression(toReplace, replaceWith));
        }
    }
}
