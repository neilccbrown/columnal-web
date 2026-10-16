// Port of xyz.columnal.transformations.expression.AddSubtractExpression (expressions module).
import { Decimal } from "../../../java/JavaBigDecimal.js";
import { javaEquals } from "../../../java/JavaObject.js";
import type { JavaRandom } from "../../../java/JavaRandom.js";
import { Rational } from "../../../java/Rational.js";
import { DataType } from "../../../types/data/datatype/DataType.js";
import { DateTimeInfo } from "../../../types/data/datatype/DateTimeInfo.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import { NumTypeExp, TypeExp } from "../../../types/typeExp/TypeExps.js";
import { MutUnitVar } from "../../../types/typeExp/units/MutUnitVar.js";
import { UnitExp } from "../../../types/typeExp/units/UnitExp.js";
import { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../utility-error/error/InternalException.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import { Log } from "../../../utility/log/Log.js";
import { Utility } from "../../../utility/utility/Utility.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import type { EvaluateState } from "./EvaluateState.js";
import { CallExpression, Expression, NaryOpExpression, NaryOpTotalExpression, StringConcatExpression } from "./Expressions.js";
import { ExpressionUtil } from "./ExpressionUtil.js";
import { QuickFix } from "./QuickFix.js";
import type { TypeState } from "./TypeState.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";

/**
 * Created by neil on 10/12/2016.
 */
export class AddSubtractExpression extends NaryOpTotalExpression
{
    private readonly ops: readonly AddSubtractExpression.AddSubtractOp[];
    private type: Expression.CheckedExp | null = null;

    public constructor(expressions: readonly Expression[], addSubtractOps: readonly AddSubtractExpression.AddSubtractOp[])
    {
        super(expressions);
        this.ops = [...addSubtractOps];
        if (addSubtractOps.length === 0)
            Log.logStackTrace("Ops empty");
    }

    public override copyNoNull(replacements: readonly Expression[]): NaryOpExpression
    {
        return new AddSubtractExpression(replacements, this.ops);
    }

    public override constantFold(): Rational | null
    {
        let running = Rational.ZERO;
        for (let i = 0; i < this.expressions.length; i++)
        {
            const r = this.expressions[i]!.constantFold();
            if (r !== null)
            {
                // PORT-NOTE: bug fix.  Java used ops.get(i), the operator after this operand rather
                // than the one before it, so it applied the wrong operators and threw
                // IndexOutOfBoundsException for the last operand.
                running = i === 0 || this.ops[i - 1] === AddSubtractExpression.AddSubtractOp.ADD ? running.plus(r) : running.minus(r);
            }
            else
                return null;
        }
        return running;
    }

    protected override saveOp(index: number): string
    {
        return this.ops[index] === AddSubtractExpression.AddSubtractOp.ADD ? "+" : "-";
    }

    public override checkNaryOp(dataLookup: Expression.ColumnLookup, state: TypeState, _kind: Expression.ExpressionKind, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        this.type = onError.recordType(this, state, this.checkAllOperandsSameTypeAndNotPatterns(new NumTypeExp(this, new UnitExp(new MutUnitVar())), dataLookup, state, Expression.LocationInfo.UNIT_CONSTRAINED, onError, p => {
            const ourType = p.getOurType();
            if (ourType === null)
                return NaryOpExpression.customErrors();
            if (ourType.prune() instanceof NumTypeExp)
            {
                const fixes = ExpressionUtil.getFixesForMatchingNumericUnits(state, p);
                if (fixes.length === 0)
                    return NaryOpExpression.customErrors();
                else
                    return NaryOpExpression.customErrors([this, new Pair<TypeExp.TypeError | null, readonly QuickFix<Expression>[]>(null, fixes)]);
            }
            let err: TypeExp.TypeError | null = null;
            if (p.getAvailableTypesForError().length > 1)
            {
                err = new TypeExp.TypeError(StyledString.concat(StyledString.s("Adding/subtracting requires numbers (with identical units), but found "), ourType.toStyledString()), p.getAvailableTypesForError());
            }
            const fixes: QuickFix<Expression>[] = [];
            // Is the problematic type text, and all ops '+'? If so, offer to convert it

            // Note: we don't unify here because we don't want to alter the type.  We could try a
            // "could this be string?" unification attempt, but really we're only interested in offering
            // the quick fix if it is definitely a string, for which we can use equals:
            if (javaEquals(ourType, TypeExp.text(null)) && this.ops.every(op => op === AddSubtractExpression.AddSubtractOp.ADD))
            {
                fixes.push(new QuickFix<Expression>("fix.stringConcat", this, () => new StringConcatExpression(this.expressions)));
            }
            try
            {
                const functionLookup = state.getFunctionLookup();
                const pruned = ourType.prune();
                if (javaEquals(pruned, TypeExp.fromDataType(null, DataType.date(new DateTimeInfo(DateTimeInfo.DateTimeType.YEARMONTHDAY)))) && this.expressions.length === 2 && this.ops.length === 1 && this.ops[0] === AddSubtractExpression.AddSubtractOp.SUBTRACT)
                {
                    fixes.push(new QuickFix<Expression>("fix.daysBetween", this, () => new CallExpression(functionLookup, "days between", ...this.expressions)));
                }
                else if (javaEquals(pruned, TypeExp.fromDataType(null, DataType.date(new DateTimeInfo(DateTimeInfo.DateTimeType.TIMEOFDAY)))) && this.expressions.length === 2 && this.ops.length === 1 && this.ops[0] === AddSubtractExpression.AddSubtractOp.SUBTRACT)
                {
                    fixes.push(new QuickFix<Expression>("fix.secondsBetween", this, () => new CallExpression(functionLookup, "seconds between", ...this.expressions)));
                }
            }
            catch (e)
            {
                if (!(e instanceof InternalException))
                    throw e;
                Log.log(e);
            }

            if (ourType instanceof NumTypeExp)
                fixes.push(...ExpressionUtil.getFixesForMatchingNumericUnits(state, p));
            const builtFixes = [...fixes];
            return err === null && builtFixes.length === 0 ? NaryOpExpression.customErrors() : NaryOpExpression.customErrors([p.getOurExpression(), new Pair<TypeExp.TypeError | null, readonly QuickFix<Expression>[]>(err, builtFixes)]);
        }));
        return this.type;
    }

    public override getValueNaryOp(values: readonly Expression.ValueResult[], state: EvaluateState): Expression.ValueResult
    {
        let n = Utility.cast(values[0]!.value, Decimal);
        for (let i = 1; i < this.expressions.length; i++)
        {
            //System.err.println("Actual Cur: " + Utility.toBigDecimal(n).toPlainString() + " after " + expressions.get(i-1).save(true));
            n = Utility.addSubtractNumbers(n, Utility.cast(values[i]!.value, Decimal), this.ops[i - 1] === AddSubtractExpression.AddSubtractOp.ADD);
        }
        //System.err.println("Actual Result: " + Utility.toBigDecimal(n).toPlainString() + " after " + expressions.get(expressions.size()-1).save(true));
        return this.result(n, state, values);
    }

    public override _test_typeFailure(r: JavaRandom, newExpressionOfDifferentType: Expression._test_TypeVary, _unitManager: UnitManager): Expression | null
    {
        const index = r.nextInt(this.expressions.length);
        return this.copy(this.makeNullList(index, newExpressionOfDifferentType.getDifferentType(this.type === null ? null : this.type.typeExp)));
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        return visitor.addSubtract(this, this.expressions, this.ops);
    }
}

export namespace AddSubtractExpression
{
    export enum AddSubtractOp
    { ADD, SUBTRACT }
}
