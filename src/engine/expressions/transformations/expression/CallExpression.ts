// Port of xyz.columnal.transformations.expression.CallExpression (expressions module).
import type { ExpressionIdentifier } from "../../../anns/Annotations.js";
import { javaEquals, javaHashCode } from "../../../java/JavaObject.js";
import type { JavaRandom } from "../../../java/JavaRandom.js";
import { ColumnId } from "../../../identifiers/id/ColumnId.js";
import { DataItemPosition } from "../../../identifiers/id/DataItemPosition.js";
import type { TableAndColumnRenames } from "../../../identifiers/id/TableAndColumnRenames.js";
import { TableId } from "../../../identifiers/id/TableId.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import { MutVar, TypeExp } from "../../../types/typeExp/TypeExps.js";
import { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../utility-error/error/InternalException.js";
import { UserException } from "../../../utility-error/error/UserException.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import { Log } from "../../../utility/log/Log.js";
import { TaggedValue } from "../../../utility/utility/TaggedValue.js";
import { Utility } from "../../../utility/utility/Utility.js";
import type { Value } from "../../../utility/utility/Value.js";
import { BracketedStatus } from "./BracketedStatus.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import type { EvaluateState } from "./EvaluateState.js";
import { EvaluationException } from "./EvaluationException.js";
import { Explanation } from "./explanation/Explanation.js";
import { ExplanationLocation } from "./explanation/ExplanationLocation.js";
import { ArrayExpression, Expression, IdentExpression, InvalidIdentExpression } from "./Expressions.js";
import type { FunctionLookup } from "./function/FunctionLookup.js";
import { ValueFunction } from "./function/ValueFunction.js";
import { QuickFix } from "./QuickFix.js";
import type { TypeState } from "./TypeState.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";
import { ExpressionVisitorFlat } from "./visitor/ExpressionVisitorFlat.js";

/**
 * Created by neil on 11/12/2016.
 */
export class CallExpression extends Expression
{
    private readonly function: Expression;
    private readonly arguments: readonly Expression[];

    // Java: CallExpression(Expression function, ImmutableList<Expression> args), and
    // CallExpression(FunctionLookup functionLookup, String functionName, Expression... args), which is
    // used for testing, and for creating quick recipe functions: creates a call to a named function
    public constructor(func: Expression, args: readonly Expression[]);
    public constructor(functionLookup: FunctionLookup, functionName: string, ...args: Expression[]);
    public constructor(a: Expression | FunctionLookup, b: readonly Expression[] | string, ...rest: Expression[])
    {
        super();
        if (typeof b === "string")
        {
            this.function = CallExpression.nonNullLookup(a as FunctionLookup, b);
            this.arguments = [...rest];
        }
        else
        {
            this.function = a as Expression;
            this.arguments = b;
        }
    }

    private static nonNullLookup(functionLookup: FunctionLookup, functionName: string): Expression
    {
        try
        {
            const functionDefinition = functionLookup.lookup(functionName);
            if (functionDefinition !== null)
                return IdentExpression.function(functionDefinition.getFullName());
        }
        catch (e)
        {
            if (!(e instanceof InternalException))
                throw e;
            Log.log(e);
        }
        return InvalidIdentExpression.identOrUnfinished(functionName);
    }

    public override check(dataLookup: Expression.ColumnLookup, state: TypeState, kind: Expression.ExpressionKind, _locationInfo: Expression.LocationInfo, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        const paramTypesBuilder: Expression.CheckedExp[] = [];

        if (!(this.function instanceof IdentExpression))
        {
            onError.recordError(this, StyledString.concat(StyledString.s("Invalid call target: "), this.function.toStyledString()));
        }

        const functionType = this.function.check(dataLookup, state, Expression.ExpressionKind.EXPRESSION, Expression.LocationInfo.UNIT_DEFAULT, onError);
        if (functionType === null)
            return null;

        for (const argument of this.arguments)
        {
            // Pattern can go through constructors, but arguments of functions must be expressions:
            // PORT-NOTE: bug fix.  Java cast the function to IdentExpression here, which threw a
            // ClassCastException if it was not one (an invalid call target, already recorded as an
            // error above).  Such a target is not a constructor, so its arguments are expressions.
            const argKind = this.function instanceof IdentExpression && this.function.getResolvedConstructor() !== null ? kind : Expression.ExpressionKind.EXPRESSION;
            const checkedExp = argument.check(dataLookup, state, argKind, Expression.LocationInfo.UNIT_DEFAULT, onError);
            if (checkedExp === null)
                return null;
            state = checkedExp.typeState;
            paramTypesBuilder.push(checkedExp);
        }
        const paramTypes = [...paramTypesBuilder];


        const returnType: TypeExp = new MutVar(this);

        let checked: TypeExp | null = null;

        let doneIndivCheck = false;

        // If the function type is already known to be a function (which should be true for calling any standard function)
        // we can individually compare the parameters to give more localised type errors on each parameter:
        if (TypeExp.isFunction(functionType.typeExp))
        {
            const functionArgTypeExp = TypeExp.getFunctionArg(functionType.typeExp);
            if (functionArgTypeExp !== null)
            {
                if (functionArgTypeExp.length === paramTypes.length)
                {
                    // Set to null if any fail
                    let paramTypeExps: TypeExp[] | null = [];
                    for (let i = 0; i < paramTypes.length; i++)
                    {
                        const paramOutcome = TypeExp.unifyTypes(functionArgTypeExp[i]!, paramTypes[i]!.typeExp);
                        const t = onError.recordError(this.arguments[i]!, paramOutcome);
                        if (t !== null && paramTypeExps !== null)
                            paramTypeExps.push(t);
                        else
                            paramTypeExps = null;
                        // We don't short circuit, so that the user sees all type errors in params.
                    }

                    const functionResultTypeExp = TypeExp.getFunctionResult(functionType.typeExp);
                    if (functionResultTypeExp !== null)
                    {
                        // Can't fail because unifying with blank MutVar:
                        TypeExp.unifyTypes(returnType, functionResultTypeExp);

                        // If success:
                        if (paramTypeExps !== null)
                        {
                            checked = TypeExp.function(this, [...paramTypeExps], returnType);
                        }
                    }

                    doneIndivCheck = true;
                }
                else
                {
                    // Wrong number of parameters; say that explicitly:
                    onError.recordError(this, StyledString.s("Wrong number of parameters: expected " + functionArgTypeExp.length + " but found " + this.arguments.length));
                    doneIndivCheck = true;
                }
            }
        }

        if (!doneIndivCheck)
        {
            const actualCallType = TypeExp.function(this, Utility.mapListI(paramTypes, p => p.typeExp), returnType);
            const temp = TypeExp.unifyTypes(functionType.typeExp, actualCallType);
            checked = onError.recordError(this, temp);
        }

        if (checked === null)
        {
            // Check after unification attempted, because that will have constrained
            // to list if possible (and not, if not)
            const functionArgTypeExp = TypeExp.getFunctionArg(functionType.typeExp);
            const takesList = functionArgTypeExp !== null && functionArgTypeExp.length === 1 && TypeExp.isList(functionArgTypeExp[0]!);
            if (takesList && this.arguments.length === 1)
            {
                const param = this.arguments[0]!;
                const prunedParam = paramTypes[0]!.typeExp.prune();

                if (!TypeExp.isList(prunedParam))
                {
                    const columnDetails = this.getColumn(param);
                    if (columnDetails !== null)
                    {
                        const table = dataLookup.getTable(columnDetails.getFirst());
                        if (table !== null)
                        {
                            const tableNN = table;
                            // Offer to turn a this-row column reference into whole column:
                            onError.recordQuickFixes(this, [
                                    new QuickFix<Expression>("fix.wholeColumn", this, () => {
                                        const newCall = new CallExpression(this.function, [IdentExpression.makeEntireColumnReference(tableNN.getTableId(), columnDetails.getSecond())]);
                                        return newCall;
                                    },
                                    ),
                            ]);
                        }
                    }
                }
            }
            else if (takesList && this.arguments.length > 1)
            {
                // Offer to turn tuple into a list:
                const replacementParam: Expression = new ArrayExpression(this.arguments);
                onError.recordQuickFixes(this, [
                        new QuickFix<Expression>("fix.squareBracketAs", this, () => {
                            const newCall = new CallExpression(this.function, [replacementParam]);
                            return newCall;
                        }),
                ]);
            }

            return null;
        }

        return onError.recordType(this, state, returnType);
    }

    private getColumn(expression: Expression): Pair<TableId | null, ColumnId> | null
    {
        return expression.visit(new class extends ExpressionVisitorFlat<Pair<TableId | null, ColumnId> | null>
        {
            protected override makeDef(_expression: Expression): Pair<TableId | null, ColumnId> | null
            {
                return null;
            }

            public override ident(_self: IdentExpression, namespace: ExpressionIdentifier | null, idents: readonly ExpressionIdentifier[], _isVariable: boolean): Pair<TableId | null, ColumnId> | null
            {
                if (namespace === "column")
                {
                    if (idents.length === 2)
                        return new Pair<TableId | null, ColumnId>(new TableId(idents[0]!), new ColumnId(idents[1]!));
                    else if (idents.length === 1)
                        return new Pair<TableId | null, ColumnId>(null, new ColumnId(idents[0]!));
                }

                return null;
            }
        }());
    }

    public override calculateValue(state: EvaluateState): Expression.ValueResult
    {
        const functionValue = Utility.cast(this.fetchSubExpression(this.function, state, []).value, ValueFunction);

        const paramValueResultsBuilder: Expression.ValueResult[] = [];
        const paramValues: Value[] = new Array<Value>(this.arguments.length);
        for (let i = 0; i < this.arguments.length; i++)
        {
            const arg = this.arguments[i]!;
            paramValues[i] = this.fetchSubExpression(arg, state, paramValueResultsBuilder).value;
        }
        const paramValueResults = [...paramValueResultsBuilder];
        if (state.recordExplanation())
        {
            const paramLocations: ValueFunction.ArgumentExplanation[] = [];
            for (let i = 0; i < this.arguments.length; i++)
            {
                const iFinal = i;
                paramLocations.push({
                    getValueExplanation(): Explanation
                    {
                        return paramValueResults[iFinal]!.makeExplanation(null);
                    },

                    getListElementLocation(index: number): ExplanationLocation | null
                    {
                        const details = paramValueResults[iFinal]!.makeExplanation(null).getResultIsLocation();
                        if (details !== null && details.rowIndex === null)
                            return new ExplanationLocation(details.tableId, details.columnId, DataItemPosition.row(index));
                        else
                            return null;
                    },
                });
            }

            try
            {
                return this.result(state, functionValue.callRecord(paramValues, [...paramLocations]));
            }
            catch (e)
            {
                if (!(e instanceof UserException))
                    throw e;
                throw new EvaluationException(e, this, Explanation.ExecutionType.VALUE, state, paramValueResults);
            }
        }
        else
        {
            try
            {
                return this.result(functionValue.call(paramValues), state);
            }
            catch (e)
            {
                if (!(e instanceof UserException))
                    throw e;
                throw new EvaluationException(e, this, Explanation.ExecutionType.VALUE, state, []);
            }
        }
    }

    public override matchAsPattern(value: Value, state: EvaluateState): Expression.ValueResult
    {
        if (!(this.function instanceof IdentExpression))
            throw new InternalException("Matching invalid call target as pattern: " + this.function.toString());
        const tag = this.function.getResolvedConstructor();
        if (tag !== null)
        {

            const taggedValue = Utility.cast(value, TaggedValue);
            if (taggedValue.getTagIndex() !== tag.tagIndex)
                return this.explanation(DataTypeUtility.value(false), Explanation.ExecutionType.MATCH, state, [], [], false);
            // If we do match, go to the inner:
            const inner = taggedValue.getInner();
            if (inner === null)
                throw new InternalException("Matching missing value against tag with inner pattern");
            // PORT-NOTE: Java then checks whether value (the TaggedValue) is an Object[] (a tuple),
            // which it never is, so that branch is omitted.
            if (this.arguments.length === 1)
            {
                return this.arguments[0]!.matchAsPattern(inner, state);
            }
            else
            {
                throw new InternalException("Matching tag argument (size > 1) against non-tuple");
            }
        }

        return super.matchAsPattern(value, state);
    }

    public override save(saveDestination: Expression.SaveDestination, _surround: BracketedStatus, renames: TableAndColumnRenames): string
    {
        return (saveDestination.needKeywords() ? "@call " : "") + this.function.save(saveDestination, BracketedStatus.NEED_BRACKETS, renames) + "(" + this.arguments.map(a => a.save(saveDestination, BracketedStatus.DONT_NEED_BRACKETS, renames)).join(", ") + ")";
    }

    public override toDisplay(displayType: Expression.DisplayType, _surround: BracketedStatus, expressionStyler: Expression.ExpressionStyler): StyledString
    {
        return expressionStyler(StyledString.concat(this.function.toDisplay(displayType, BracketedStatus.NEED_BRACKETS, expressionStyler), StyledString.s("("), StyledString.joining(this.arguments.map(a => a.toDisplay(displayType, BracketedStatus.DONT_NEED_BRACKETS, expressionStyler)), ", "), StyledString.s(")")), this);
    }

    public override _test_childMutationPoints(): Pair<Expression, (e: Expression) => Expression>[]
    {
        //return Stream.<Pair<Expression, Function<Expression, Expression>>>concat(
            return this.function._test_allMutationPoints().map(p => new Pair<Expression, (e: Expression) => Expression>(p.getFirst(), newExp => new CallExpression(p.getSecond()(newExp), this.arguments)));
            //param._test_allMutationPoints().<Pair<Expression, Function<Expression, Expression>>>map(p -> new Pair<>(p.getFirst(), newExp -> new CallExpression(function, p.getSecond().apply(newExp))))
        //);
    }

    public override _test_typeFailure(r: JavaRandom, newExpressionOfDifferentType: Expression._test_TypeVary, unitManager: UnitManager): Expression | null
    {
        const paramIndex = r.nextInt(this.arguments.length);
        const badParam = this.arguments[paramIndex]!._test_typeFailure(r, newExpressionOfDifferentType, unitManager);
        if (badParam === null)
            return null;
        const badCopy = [...this.arguments];
        badCopy[paramIndex] = badParam;
        return new CallExpression(this.function, badCopy);
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof CallExpression) || o.constructor !== this.constructor) return false;

        const that = o;

        if (!this.function.equals(that.function)) return false;
        return javaEquals(this.arguments, that.arguments);
    }

    public override hashCode(): number
    {
        let result = this.function.hashCode();
        result = (Math.imul(31, result) + javaHashCode(this.arguments)) | 0;
        return result;
    }

    public getFunction(): Expression
    {
        return this.function;
    }

    public getParams(): readonly Expression[]
    {
        return this.arguments;
    }

    public override replaceSubExpression(toReplace: Expression, replaceWith: Expression): Expression
    {
        if (this === toReplace)
            return replaceWith;
        else
            return new CallExpression(this.function.replaceSubExpression(toReplace, replaceWith), Utility.mapListI(this.arguments, a => a.replaceSubExpression(toReplace, replaceWith)));
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        return visitor.call(this, this.function, this.arguments);
    }
}
