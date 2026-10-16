// Port of xyz.columnal.transformations.expression.Expression (expressions module).
// Load through Expressions.ts (see "Class hierarchies split across files" in docs/CONVENTIONS.md).
//
// PORT-NOTE: methods that Java declares protected but that other classes in the package call
// (toDisplay, result, explanation, ...) are public here, as TypeScript has no package access.
import type { ExpressionIdentifier } from "../../../anns/Annotations.js";
import type { ReadonlyMapLike } from "../../../java/HashMap.js";
import { Decimal, toPlainString } from "../../../java/JavaBigDecimal.js";
import type { JavaRandom } from "../../../java/JavaRandom.js";
import type { Rational } from "../../../java/Rational.js";
import type { ColumnId } from "../../../identifiers/id/ColumnId.js";
import { TableAndColumnRenames } from "../../../identifiers/id/TableAndColumnRenames.js";
import type { TableId } from "../../../identifiers/id/TableId.js";
import type { DataType } from "../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import type { DataTypeValue } from "../../../types/data/datatype/DataTypeValue.js";
import type { TypeManager } from "../../../types/data/datatype/TypeManager.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import { ExpressionBase } from "../../../types/typeExp/ExpressionBase.js";
import type { TypeExp } from "../../../types/typeExp/TypeExps.js";
import { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../utility-error/error/InternalException.js";
import { UserException } from "../../../utility-error/error/UserException.js";
import type { StyledShowable } from "../../../utility-error/styled/StyledShowable.js";
import { StyledString, type StyleTarget } from "../../../utility-error/styled/StyledString.js";
import { Log } from "../../../utility/log/Log.js";
import { Utility } from "../../../utility/utility/Utility.js";
import type { Value } from "../../../utility/utility/Value.js";
import type { BracketedStatus } from "./BracketedStatus.js";
import { BracketedStatus as BracketedStatusEnum } from "./BracketedStatus.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import { EvaluateState } from "./EvaluateState.js";
import { EvaluationException } from "./EvaluationException.js";
import { Explanation, type ReadonlySetLike } from "./explanation/Explanation.js";
import type { ExplanationLocation } from "./explanation/ExplanationLocation.js";
import type { FunctionLookup } from "./function/FunctionLookup.js";
import { ValueFunction } from "./function/ValueFunction.js";
import { IdentExpression, type ImplicitLambdaArg } from "./Expressions.js";
import type { QuickFix } from "./QuickFix.js";
import type { Replaceable } from "./Replaceable.js";
import type { TypeState } from "./TypeState.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";
import { ExpressionVisitorStream } from "./visitor/ExpressionVisitorStream.js";

/**
 * Created by neil on 24/11/2016.
 */
export abstract class Expression extends ExpressionBase implements StyledShowable, Replaceable<Expression>, Explanation.ExplanationSource
{
    public static readonly MAX_STRING_SOLVER_LENGTH = 8;

    // Checks that all used variable names (unless this is a pattern) and column references are defined,
    // and that types check.  Return null if any problems.
    public abstract check(dataLookup: Expression.ColumnLookup, typeState: TypeState, kind: Expression.ExpressionKind, locationInfo: Expression.LocationInfo, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null;

    // Calls check with EXPRESSION kind, and returns just the type, discarding the state.
    public checkExpression(dataLookup: Expression.ColumnLookup, typeState: TypeState, onError: ErrorAndTypeRecorder): TypeExp | null
    {
        IdentExpression.resolveThroughout(this, dataLookup, typeState.getFunctionLookup(), typeState.getTypeManager());
        const check = this.check(dataLookup, typeState, Expression.ExpressionKind.EXPRESSION, Expression.LocationInfo.UNIT_DEFAULT, onError);
        if (check === null)
            return null;
        return check.typeExp;
    }

    // Java: result(@Value Object value, EvaluateState state), result(value, state, ImmutableList<ValueResult> childrenForExplanations)
    // and result(EvaluateState state, RecordedFunctionResult recordedFunctionResult)
    public result(value: Value, state: EvaluateState, childrenForExplanations?: readonly Expression.ValueResult[]): Expression.ValueResult;
    public result(state: EvaluateState, recordedFunctionResult: ValueFunction.RecordedFunctionResult): Expression.ValueResult;
    public result(a: Value | EvaluateState, b: EvaluateState | ValueFunction.RecordedFunctionResult, childrenForExplanations: readonly Expression.ValueResult[] = []): Expression.ValueResult
    {
        if (b instanceof ValueFunction.RecordedFunctionResult)
            return this.resultRecorded(a as EvaluateState, b);
        return this.explanation(a as Value, Explanation.ExecutionType.VALUE, b, childrenForExplanations, [], false, null);
    }

    public resultIsLocation(value: Value, state: EvaluateState, childrenForExplanations: readonly Expression.ValueResult[], resultLocation: ExplanationLocation, skipChildrenIfTrivial: boolean): Expression.ValueResult
    {
        return this.explanation(value, Explanation.ExecutionType.VALUE, state, childrenForExplanations, [resultLocation], skipChildrenIfTrivial, resultLocation);
    }

    // Java: two overloads, the shorter passing null for resultIsLocation
    public explanation(value: Value, executionType: Explanation.ExecutionType, state: EvaluateState, childrenForExplanations: readonly Expression.ValueResult[], usedLocations: readonly ExplanationLocation[], skipChildrenIfTrivial: boolean, resultIsLocation: ExplanationLocation | null = null): Expression.ValueResult
    {
        if (!state.recordExplanation())
        {
            return new class extends Expression.ValueResult
            {
                public override makeExplanation(_overrideExecutionType: Explanation.ExecutionType | null): Explanation
                {
                    throw new InternalException("Fetching explanation but did not record explanation");
                }
            }(value, state);
        }

        // eslint-disable-next-line @typescript-eslint/no-this-alias -- the inner class's outer instance
        const outer = this;
        return new class extends Expression.ValueResult
        {
            public override makeExplanation(overrideExecutionType: Explanation.ExecutionType | null): Explanation
            {
                const evaluateState = this.evaluateState;
                return new class extends Explanation
                {
                    public override describe(_alreadyDescribed: ReadonlySetLike<Explanation>, hyperlinkLocation: (location: ExplanationLocation) => StyledString, expressionStyler: Expression.ExpressionStyler, extraLocations: readonly ExplanationLocation[], skipIfTrivial: boolean): StyledString | null
                    {
                        return outer.describe(value, this.executionType, evaluateState, hyperlinkLocation, expressionStyler, Utility.concatI(usedLocations, extraLocations), skipIfTrivial);
                    }

                    public override getDirectSubExplanations(): readonly Explanation[]
                    {
                        return Utility.mapListInt(childrenForExplanations, e => e.makeExplanation(null));
                    }

                    public override excludeChildrenIfTrivial(): boolean
                    {
                        return skipChildrenIfTrivial;
                    }
                }(outer, overrideExecutionType !== null ? overrideExecutionType : executionType, evaluateState, value, usedLocations, resultIsLocation);
            }

            public override getDirectlyUsedLocations(): readonly ExplanationLocation[]
            {
                return usedLocations;
            }
        }(value, state);
    }

    protected describe(value: Value, executionType: Explanation.ExecutionType, _evaluateState: EvaluateState, hyperlinkLocation: (location: ExplanationLocation) => StyledString, expressionStyler: Expression.ExpressionStyler, usedLocations: readonly ExplanationLocation[], skipIfTrivial: boolean): StyledString | null
    {
        // Don't bother explaining literals, or trivial if we are skipping trivial:
        if (this.hideFromExplanation(skipIfTrivial))
            return null;

        // Or things which result in functions, as output won't be useful:
        if (value instanceof ValueFunction)
            return null;

        const using = usedLocations.length === 0 ? StyledString.s("") : StyledString.concat(StyledString.s(", using "), StyledString.joining(usedLocations.filter(l => l.rowIndex !== null).map(hyperlinkLocation), ", "));

        if (executionType === Explanation.ExecutionType.MATCH && typeof value === "boolean")
        {
            return StyledString.concat(this.toDisplay(Expression.DisplayType.SIMPLE, BracketedStatusEnum.DONT_NEED_BRACKETS, expressionStyler), StyledString.s(value ? " matched" : " did not match"), using);
        }
        else
        {
            // TODO hyperlink truncated items to allow displaying their full value
            return StyledString.concat(this.toDisplay(Expression.DisplayType.SIMPLE, BracketedStatusEnum.DONT_NEED_BRACKETS, expressionStyler), StyledString.s(" was "), StyledString.s(DataTypeUtility.valueToString(value, null, false, {
                truncateNumber(number: Decimal): string
                {
                    if (!Utility.isIntegral(number))
                    {
                        // From https://stackoverflow.com/questions/7572309/any-neat-way-to-limit-significant-figures-with-bigdecimal
                        // PORT-NOTE: Java's bd.setScale(newScale, RoundingMode.HALF_UP).toPlainString(), where
                        // newScale = targetSF - bd.precision() + bd.scale(), which rounds to six significant figures
                        // and shows newScale decimal places (keeping trailing zeros).
                        const bd = Utility.toBigDecimal(number);
                        const targetSF = 6;
                        const newScale = targetSF - bd.precision(true) + bd.decimalPlaces();

                        const rounded = bd.toSignificantDigits(targetSF, Decimal.ROUND_HALF_UP);
                        return (newScale > 0 ? rounded.toFixed(newScale) : toPlainString(rounded)) + "…";
                    }
                    // Use default behaviour:
                    return DataTypeUtility.valueToStringFX(number);
                },
            })), using);
        }
    }

    private resultRecorded(state: EvaluateState, recordedFunctionResult: ValueFunction.RecordedFunctionResult): Expression.ValueResult
    {
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- the inner class's outer instance
        const outer = this;
        return new class extends Expression.ValueResult
        {
            public override makeExplanation(overrideExecutionType: Explanation.ExecutionType | null): Explanation
            {
                const value = this.value;
                const evaluateState = this.evaluateState;
                return new class extends Explanation
                {
                    public override describe(_alreadyDescribed: ReadonlySetLike<Explanation>, hyperlinkLocation: (location: ExplanationLocation) => StyledString, expressionStyler: Expression.ExpressionStyler, extraLocations: readonly ExplanationLocation[], skipIfTrivial: boolean): StyledString | null
                    {
                        return outer.describe(value, this.executionType, evaluateState, hyperlinkLocation, expressionStyler, Utility.concatI(recordedFunctionResult.usedLocations, extraLocations), skipIfTrivial);
                    }

                    public override getDirectSubExplanations(): readonly Explanation[]
                    {
                        return recordedFunctionResult.childExplanations;
                    }
                }(outer, overrideExecutionType !== null ? overrideExecutionType : Explanation.ExecutionType.VALUE, evaluateState, value, recordedFunctionResult.usedLocations, recordedFunctionResult.resultIsLocation);
            }

            public override getDirectlyUsedLocations(): readonly ExplanationLocation[]
            {
                return recordedFunctionResult.usedLocations;
            }
        }(recordedFunctionResult.result, state);
    }

    /**
     * Gets the value for this expression at the given evaluation state
     */
    public abstract calculateValue(state: EvaluateState): Expression.ValueResult;

    // Fetches a sub-expression and adjusts stack trace and explanation if there is an exception.  If not, adds to passed builder and returns
    // (Java: ImmutableList.Builder<ValueResult> subExpressionsSoFar; here an array that is added to)
    public fetchSubExpression(subExpression: Expression, state: EvaluateState, subExpressionsSoFar: Expression.ValueResult[]): Expression.ValueResult
    {
        try
        {
            const result = subExpression.calculateValue(state);
            subExpressionsSoFar.push(result);
            return result;
        }
        catch (e)
        {
            if (!(e instanceof EvaluationException))
                throw e;
            throw new EvaluationException(e, this, Explanation.ExecutionType.VALUE, state, [...subExpressionsSoFar]);
        }
    }

    public matchSubExpressionAsPattern(subExpression: Expression, matchAgainst: Value, state: EvaluateState, subExpressionsSoFar: Expression.ValueResult[]): Expression.ValueResult
    {
        try
        {
            const result = subExpression.matchAsPattern(matchAgainst, state);
            subExpressionsSoFar.push(result);
            return result;
        }
        catch (e)
        {
            if (!(e instanceof EvaluationException))
                throw e;
            throw new EvaluationException(e, this, Explanation.ExecutionType.MATCH, state, [...subExpressionsSoFar]);
        }
    }

    // Note that there will be duplicates if referred to multiple times
    public allVariableReferences(): string[]
    {
        return this.visit(new class extends ExpressionVisitorStream<string>
        {
            public override ident(_self: IdentExpression, _namespace: ExpressionIdentifier | null, idents: readonly ExpressionIdentifier[], isVariable: boolean): string[]
            {
                if (isVariable)
                    return [idents[0]!];
                else
                    return [];
            }

            public override implicitLambdaArg(self: ImplicitLambdaArg): string[]
            {
                return Utility.streamNullable(self.getVarNameOrNull());
            }
        }());
    }

    public abstract visit<T>(visitor: ExpressionVisitor<T>): T;

    /**
     *
     * @param saveDestination If SAVE_EXTERNAL, include full keywords for things like invalid, function calls etc.
     *                   If EDITOR, give back string which could be entered direct in the GUI.
     * @param surround
     * @param typeManager
     * @param renames
     * @return
     */
    public abstract save(saveDestination: Expression.SaveDestination, surround: BracketedStatus, renames: TableAndColumnRenames): string;

    // Java: returns Optional<Rational>
    public constantFold(): Rational | null
    {
        return null;
    }

    public hideFromExplanation(_skipIfTrivial: boolean): boolean
    {
        return false;
    }

    // Vaguely similar to getValue, but instead checks if the expression matches the given value
    // For many expressions, matching means equality, but if a new-variable item is involved
    // it's not necessarily plain equality.
    // Given that the expression has type-checked, you can assume the value is of the same type
    // as the current expression (and throw an InternalException if not)
    // If you override this, you should also override checkAsPattern
    // If there is a match, returns result with true value.  If no match, returns a result with false value.
    public matchAsPattern(value: Value, state: EvaluateState): Expression.ValueResult
    {
        const ourValue = this.calculateValue(state);
        try
        {
            return this.explanation(DataTypeUtility.value(Utility.compareValues(value, ourValue.value) === 0), Explanation.ExecutionType.MATCH, state, [ourValue], ourValue.getDirectlyUsedLocations(), false);
        }
        catch (e)
        {
            if (!(e instanceof UserException))
                throw e;
            throw new EvaluationException(e, this, Explanation.ExecutionType.MATCH, state, [ourValue]);
        }
    }

    public override toString(): string
    {
        return this.save(Expression.SaveDestination.TO_STRING, BracketedStatusEnum.DONT_NEED_BRACKETS, TableAndColumnRenames.EMPTY);
    }

    // This is like a zipper.  It gets a list of all expressions in the tree (i.e. all nodes)
    // and returns them, along with a function.  If you pass that function a replacement,
    // it will build you a new copy of the entire expression with that one node replaced.
    // Used for testing
    public _test_allMutationPoints(): Pair<Expression, (e: Expression) => Expression>[]
    {
        return [new Pair<Expression, (e: Expression) => Expression>(this, e => e), ...this._test_childMutationPoints()];
    }

    public abstract _test_childMutationPoints(): Pair<Expression, (e: Expression) => Expression>[];

    // If this item can't make a type failure by itself (e.g. a literal) then returns null
    // Otherwise, uses the given generator to make a copy of itself which contains a type failure
    // in this node.  E.g. an equals expression might replace the lhs or rhs with a different type
    public abstract _test_typeFailure(r: JavaRandom, newExpressionOfDifferentType: Expression._test_TypeVary, unitManager: UnitManager): Expression | null;

    // Force sub-expressions to implement equals and hashCode:
    public abstract equals(o: unknown): boolean;
    public abstract hashCode(): number;

    public abstract replaceSubExpression(toReplace: Expression, replaceWith: Expression): Expression;

    public toStyledString(): StyledString
    {
        return this.toDisplay(Expression.DisplayType.FULL, BracketedStatusEnum.DONT_NEED_BRACKETS, (s, _e) => s);
    }

    public toSimpleStyledString(): StyledString
    {
        return this.toDisplay(Expression.DisplayType.SIMPLE, BracketedStatusEnum.DONT_NEED_BRACKETS, (s, _e) => s);
    }

    public abstract toDisplay(displayType: Expression.DisplayType, bracketedStatus: BracketedStatus, expressionStyler: Expression.ExpressionStyler): StyledString;

    // Styles the string to look like a user-typed part of the expression
    protected static styledExpressionInput(s: string): StyledString
    {
        return StyledString.fancyQuote(StyledString.styled(s, new ExpressionInputStyle()));
    }
}

class ExpressionInputStyle extends StyledString.Style<ExpressionInputStyle>
{
    public constructor()
    {
        super(ExpressionInputStyle);
    }

    public override applyTo(target: StyleTarget): void
    {
        target.classes.add("expression-input");
    }

    public override combine(_withStyle: ExpressionInputStyle): ExpressionInputStyle
    {
        return this;
    }

    protected override equalsStyle(_item: ExpressionInputStyle): boolean
    {
        return true;
    }
}

export namespace Expression
{
    export interface ColumnLookup
    {
        // If you pass null for table, you get the default table (or null if none)
        // If no such table/column is found, null is returned
        // Calling getCollapsed  with row number on .dataTypeValue should get corresponding value.
        getColumn(expression: Expression, tableId: TableId | null, columnId: ColumnId): ColumnLookup.FoundColumn | null;

        // If no such table is found, null is returned.
        // If null is passed, uses the current table (if applicable; null return if not -- used for converting from column references)
        getTable(tableName: TableId | null): ColumnLookup.FoundTable | null;

        // This is really for the editor autocomplete, but it doesn't rely on any GUI
        // functionality so can be here:
        getAvailableColumnReferences(): Pair<TableId | null, ColumnId>[];

        // This is really for the editor autocomplete, but it doesn't rely on any GUI
        // functionality so can be here:
        getAvailableTableReferences(): TableId[];

        /**
         * Called when the column is clicked, to find out
         * which column reference to insert into the editor.  If the column is not clickable, will return empty stream.
         */
        getPossibleColumnReferences(tableId: TableId, columnId: ColumnId): ColumnLookup.ClickedReference[];

        // Java: a default method returning null
        getFixForIdent?(namespace: ExpressionIdentifier | null, idents: readonly ExpressionIdentifier[], target: Expression): QuickFix<Expression> | null;
    }

    export namespace ColumnLookup
    {
        export class FoundColumn
        {
            public readonly tableId: TableId;
            public readonly tableCanBeOmitted: boolean;
            public readonly dataTypeValue: DataTypeValue;
            public readonly information: Pair<StyledString, QuickFix<Expression> | null> | null;

            public constructor(tableId: TableId, tableCanBeOmitted: boolean, dataTypeValue: DataTypeValue, information: Pair<StyledString, QuickFix<Expression> | null> | null)
            {
                this.tableId = tableId;
                this.tableCanBeOmitted = tableCanBeOmitted;
                this.dataTypeValue = dataTypeValue;
                this.information = information;
            }
        }

        export interface FoundTable
        {
            getTableId(): TableId;

            getColumnTypes(): ReadonlyMapLike<ColumnId, DataTypeValue>;

            getRowCount(): number;
        }

        export abstract class ClickedReference
        {
            private readonly tableId: TableId;
            private readonly columnId: ColumnId;

            public constructor(tableId: TableId, columnId: ColumnId)
            {
                this.tableId = tableId;
                this.columnId = columnId;
            }

            public abstract getExpression(): Expression;

            public getTableId(): TableId
            {
                return this.tableId;
            }

            public getColumnId(): ColumnId
            {
                return this.columnId;
            }
        }
    }

    // PATTERN infects EXPRESSION: any bit of PATTERN in an inner expression
    // requires the outer expression to either throw an error, or be a PATTERN itself
    export enum ExpressionKind { EXPRESSION, PATTERN }

    /**
     * If something is a plain expression, then all we need to know is the TypeExp.
     *
     * If something is a pattern, we then need to know:
     *  - Its type (as above)
     *  - The resulting type state (since a pattern may modify it)
     *  - The types for which we need Equatable when this is use in a pattern match.
     *
     *  For example, if you have the tuple:
     *    (3, @anything, existingVar, $newVar)
     *
     *  This is a pattern.  Its type is (Num, Any, existingVar's type, Any),
     *  its resulting state assigns a type for newVar, and we require Equatable
     *  on Num and existingVar's type.
     *
     *  This can then validly be matched against:
     *    (3, (? + 1), value of existingVar's type, (? - 1))
     *  Provided existingVar's type is Equatable, without needing Equatable for the functions.
     */

    export class CheckedExp
    {
        public readonly typeExp: TypeExp;
        public readonly typeState: TypeState;
        // We could actually apply these immediately, because it's disallowed
        // to have a pattern outside a pattern match.  But then any creation
        // of a pattern would get that error, plus a whole load of
        // Equatable failures without any equality check in sight.
        // So we store the type that need Equatable here, and apply them once we see the equality match.
        // Always empty if type is EXPRESSION
        private readonly equalityRequirements: readonly TypeExp[];

        // Java: public CheckedExp(TypeExp, TypeState) and a private constructor that also takes equalityRequirements
        public constructor(typeExp: TypeExp, typeState: TypeState, equalityRequirements: readonly TypeExp[] = [])
        {
            this.typeExp = typeExp;
            this.typeState = typeState;
            this.equalityRequirements = equalityRequirements;
        }

        /**
         * Make sure this item is equatable.
         */
        public requireEquatable(): void
        {
            /*TODO!
            TypeClassRequirements equatable = TypeClassRequirements.require("Equatable", "<match>");
            if (expressionKind == ExpressionKind.PATTERN)
            {
                for (TypeExp t : equalityRequirements)
                {
                    t.requireTypeClasses(equatable);
                }
            }
            else if (expressionKind == ExpressionKind.EXPRESSION)
            {
                typeExp.requireTypeClasses(equatable);
            }
             */
        }

        // If the argument is null, just return this.
        // If non-null, check the item is an expression, and then apply the operator to our type
        public applyToType(changeType: ((t: TypeExp) => TypeExp) | null): CheckedExp
        {
            if (changeType === null)
                return this;
            return new CheckedExp(changeType(this.typeExp), this.typeState, this.equalityRequirements);
        }
    }

    export enum LocationInfo
    {
        // Multiply or divide:
        UNIT_MODIFYING,
        // Comparison, add or compare
        UNIT_CONSTRAINED,
        // All the rest:
        UNIT_DEFAULT,
    }

    /**
     * For convenience this is a non-static class, as the Expression reference
     * is used by the default implementation of makeExplanation.
     * If you override makeExplanation, it doesn't matter which Expression
     * instance is used to construct the object.
     */
    export abstract class ValueResult
    {
        public readonly value: Value;
        // State after execution:
        public readonly evaluateState: EvaluateState;

        public constructor(value: Value, state: EvaluateState)
        {
            this.value = value;
            this.evaluateState = state;
        }

        public abstract makeExplanation(overrideExecutionType: Explanation.ExecutionType | null): Explanation;

        // Locations used directly by this result, not including
        // locations from child explanations
        public getDirectlyUsedLocations(): readonly ExplanationLocation[]
        {
            return [];
        }
    }

    export interface SaveDestination
    {
        /**
         * Disambiguates namespace plus idents for the purpose of saving.
         * @param namespace
         * @param idents
         * @return
         */
        disambiguate(namespace: ExpressionIdentifier | null, idents: readonly ExpressionIdentifier[]): Pair<ExpressionIdentifier | null, readonly ExpressionIdentifier[]>;

        /**
         * Makes a new save destination with the given names defined (namespace plus idents for each entry)
         * @param names
         * @return
         */
        withNames(names: readonly Pair<ExpressionIdentifier | null, readonly ExpressionIdentifier[]>[]): SaveDestination;

        /**
         * Get all the defined names in the given namespace
         */
        definedNames(namespace: string): (readonly string[])[];

        /**
         * Do we need keywords like @call, @unfinished, etc?
         * @return
         */
        needKeywords(): boolean;
    }

    export namespace SaveDestination
    {
        export const TO_STRING: SaveDestination = {
            disambiguate(namespace: ExpressionIdentifier | null, idents: readonly ExpressionIdentifier[]): Pair<ExpressionIdentifier | null, readonly ExpressionIdentifier[]>
            {
                // Give everything in full:
                return new Pair(namespace, idents);
            },

            withNames(_names: readonly Pair<ExpressionIdentifier | null, readonly ExpressionIdentifier[]>[]): SaveDestination
            {
                return this;
            },

            definedNames(_namespace: string): (readonly string[])[]
            {
                return [];
            },

            needKeywords(): boolean
            {
                return false;
            },
        };
        // Same thing so can just re-use:
        export const TO_EDITOR_FULL_NAME: SaveDestination = TO_STRING;

        export const TO_FILE: SaveDestination = {
            disambiguate(namespace: ExpressionIdentifier | null, idents: readonly ExpressionIdentifier[]): Pair<ExpressionIdentifier | null, readonly ExpressionIdentifier[]>
            {
                // Give everything in full:
                return new Pair(namespace, idents);
            },

            withNames(_names: readonly Pair<ExpressionIdentifier | null, readonly ExpressionIdentifier[]>[]): SaveDestination
            {
                return this;
            },

            definedNames(_namespace: string): (readonly string[])[]
            {
                return [];
            },

            needKeywords(): boolean
            {
                return true;
            },
        };

        export class ToEditor implements SaveDestination
        {
            private readonly names: readonly Pair<ExpressionIdentifier | null, readonly ExpressionIdentifier[]>[];

            public constructor(names: readonly Pair<ExpressionIdentifier | null, readonly ExpressionIdentifier[]>[])
            {
                this.names = names;
            }

            public disambiguate(namespace: ExpressionIdentifier | null, idents: readonly ExpressionIdentifier[]): Pair<ExpressionIdentifier | null, readonly ExpressionIdentifier[]>
            {
                // Need to keep adding idents backwards from end until it is not ambigious:
                let usingNamespace = false;
                let firstIdentUsed = idents.length - 1;
                // Can only increase scoping if we're not using the namespace or are not yet using all idents
                increaseScoping: while (!usingNamespace || firstIdentUsed > 0)
                {
                    const inUse = idents.slice(firstIdentUsed, idents.length);

                    let matchCount = 0;
                    for (const name of this.names)
                    {
                        // We need to make sure that name resolving to its intended destination is not mistaken for a conflict.
                        // Our first step of resolution is to add the namespace, and if that isn't enough, we scope name further and further.
                        // Conflicts arise only when:
                        // - The namespace for the target is non-null AND not in use AND there is another name from another namespace which would match.  In this case, use namespace
                        // - (The namespace for the target is null OR in use) AND there are *more than one* names from that namespace (or any namespaceif target has null) which would match.  In this case, increase scoping.

                        if (!usingNamespace && namespace !== null && namespace !== name.getFirst() && ToEditor.couldMatch(inUse, name.getSecond()))
                        {
                            usingNamespace = true;
                            continue increaseScoping;
                        }

                        if ((!usingNamespace || namespace === null || namespace === name.getFirst()) && ToEditor.couldMatch(inUse, name.getSecond()))
                        {
                            matchCount += 1;
                        }
                    }
                    if (matchCount > 1 && firstIdentUsed > 0)
                    {
                        firstIdentUsed -= 1;
                    }
                    else if (matchCount === 1)
                    {
                        // Match just one name
                        break increaseScoping;
                    }
                    else if (matchCount === 0)
                    {
                        // Match nothing; preserve fully as-is:
                        usingNamespace = namespace !== "var";
                        firstIdentUsed = 0;
                        break increaseScoping;
                    }
                    else
                    {
                        break increaseScoping;
                    }
                }
                return new Pair(usingNamespace ? namespace : null, idents.slice(firstIdentUsed, idents.length));
            }

            private static couldMatch(currentCandidateScoping: readonly ExpressionIdentifier[], fullName: readonly ExpressionIdentifier[]): boolean
            {
                if (currentCandidateScoping.length > fullName.length)
                    return false; // Already scoped enough to avoid the confusion
                // We go backwards:
                for (let i = 1; i <= currentCandidateScoping.length; i++)
                {
                    if (currentCandidateScoping[currentCandidateScoping.length - i] !== fullName[fullName.length - i])
                    {
                        return false;
                    }
                }
                // All match up to the length we've scoped to:
                return true;
            }

            public withNames(names: readonly Pair<ExpressionIdentifier | null, readonly ExpressionIdentifier[]>[]): SaveDestination
            {
                return new ToEditor(Utility.concatI(this.names, names));
            }

            public definedNames(namespace: string): (readonly string[])[]
            {
                return this.names.filter(p => namespace === p.getFirst()).map(p => p.getSecond());
            }

            public needKeywords(): boolean
            {
                return false;
            }
        }

        // We need names of tables, columns, functions, tags:
        export function toExpressionEditor(typeManager: TypeManager, columnLookup: ColumnLookup, functionLookup: FunctionLookup): SaveDestination
        {
            const names: Pair<ExpressionIdentifier | null, readonly ExpressionIdentifier[]>[] = [];

            for (const ttd of typeManager.getKnownTaggedTypes().values())
            {
                for (const tag of ttd.getTags())
                {
                    names.push(new Pair("tag", [ttd.getTaggedTypeName().getRaw(), tag.getName()]));
                }
            }
            try
            {
                for (const f of functionLookup.getAllFunctions())
                {
                    names.push(new Pair("function", f.getFullName()));
                }
            }
            catch (e)
            {
                if (!(e instanceof InternalException))
                    throw e;
                Log.log(e);
            }

            for (const column of columnLookup.getAvailableColumnReferences())
            {
                const tableId = column.getFirst();
                names.push(new Pair("column", tableId === null ? [column.getSecond().getRaw()] : [tableId.getRaw(), column.getSecond().getRaw()]));
            }
            for (const table of columnLookup.getAvailableTableReferences())
            {
                names.push(new Pair("table", [table.getRaw()]));
            }

            return new ToEditor(names);
        }

        export function toTypeEditor(_typeManager: TypeManager): SaveDestination
        {
            // There is no scoping on type names at the moment anyway:
            return TO_EDITOR_FULL_NAME;
        }

        export function toUnitEditor(_unitManager: UnitManager): SaveDestination
        {
            // There is no scoping on unit names at the moment anyway:
            return TO_EDITOR_FULL_NAME;
        }
    }

    export type ExpressionStyler = (display: StyledString, src: Expression) => StyledString;

    export enum DisplayType
    {
        SIMPLE, FULL,
    }

    // Only for testing:
    export interface _test_TypeVary
    {
        getDifferentType(type: TypeExp | null): Expression;
        getAnyType(): Expression;
        getNonNumericType(): Expression;

        getType(mustMatch: (t: DataType) => boolean): Expression;
        getTypes(amount: number, mustMatch: (types: DataType[]) => boolean): Expression[];

        makeArrayExpression(items: readonly Expression[]): Expression;

        getTypeManager(): TypeManager;
    }
}
