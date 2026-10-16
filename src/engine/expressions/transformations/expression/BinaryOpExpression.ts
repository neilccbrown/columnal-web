// Port of xyz.columnal.transformations.expression.BinaryOpExpression (expressions module).
import { javaStringHashCode } from "../../../java/JavaObject.js";
import type { JavaRandom } from "../../../java/JavaRandom.js";
import type { TableAndColumnRenames } from "../../../identifiers/id/TableAndColumnRenames.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import { NumTypeExp } from "../../../types/typeExp/TypeExps.js";
import { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { UserException } from "../../../utility-error/error/UserException.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import type { Value } from "../../../utility/utility/Value.js";
import { BracketedStatus } from "./BracketedStatus.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import type { EvaluateState } from "./EvaluateState.js";
import { EvaluationException } from "./EvaluationException.js";
import { Explanation } from "./explanation/Explanation.js";
import { Expression, ImplicitLambdaArg } from "./Expressions.js";
import type { TypeState } from "./TypeState.js";

/**
 * Created by neil on 25/11/2016.
 */
export abstract class BinaryOpExpression extends Expression
{
    /*
    public static enum Op
    {
        AND("&"), OR("|"), EQUALS("="), ADD("+"), SUBTRACT("-");

        private final String symbol;

        Op(String symbol)
        {
            this.symbol = symbol;
        }

        public static @Nullable Op parse(String text)
        {
            for (Op op : values())
                if (op.symbol.equals(text))
                    return op;
            return null;
        }
    }

    private final Op op;*/
    protected readonly lhs: Expression;
    protected readonly rhs: Expression;
    protected lhsType: Expression.CheckedExp | null = null;
    protected rhsType: Expression.CheckedExp | null = null;

    protected constructor(lhs: Expression, rhs: Expression)
    {
        super();
        this.lhs = lhs;
        this.rhs = rhs;
    }

    public override save(saveDestination: Expression.SaveDestination, surround: BracketedStatus, renames: TableAndColumnRenames): string
    {
        const inner = this.lhs.save(saveDestination, BracketedStatus.NEED_BRACKETS, renames) + " " + this.saveOp() + " " + this.rhs.save(saveDestination, BracketedStatus.NEED_BRACKETS, renames);
        if (surround !== BracketedStatus.NEED_BRACKETS)
            return inner;
        else
            return "(" + inner + ")";
    }

    public override toDisplay(displayType: Expression.DisplayType, surround: BracketedStatus, expressionStyler: Expression.ExpressionStyler): StyledString
    {
        const inner = StyledString.concat(this.lhs.toDisplay(displayType, BracketedStatus.NEED_BRACKETS, expressionStyler), StyledString.s(" " + this.saveOp() + " "), this.rhs.toDisplay(displayType, BracketedStatus.NEED_BRACKETS, expressionStyler));
        if (surround !== BracketedStatus.NEED_BRACKETS)
            return expressionStyler(inner, this);
        else
            return expressionStyler(StyledString.roundBracket(inner), this);
    }

    // For saving to string:
    protected abstract saveOp(): string;

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof BinaryOpExpression) || o.constructor !== this.constructor) return false;

        const that = o;

        if (this.saveOp() !== that.saveOp()) return false;
        if (!this.lhs.equals(that.lhs)) return false;
        return this.rhs.equals(that.rhs);
    }

    public override hashCode(): number
    {
        let result = this.lhs.hashCode();
        result = (Math.imul(31, result) + javaStringHashCode(this.saveOp())) | 0;
        result = (Math.imul(31, result) + this.rhs.hashCode()) | 0;
        return result;
    }

    public abstract copy(replaceLHS: Expression | null, replaceRHS: Expression | null): BinaryOpExpression;

    public override replaceSubExpression(toReplace: Expression, replaceWith: Expression): Expression
    {
        if (this === toReplace)
            return replaceWith;
        else
            return this.copy(this.lhs.replaceSubExpression(toReplace, replaceWith), this.rhs.replaceSubExpression(toReplace, replaceWith));
    }

    public override calculateValue(state: EvaluateState): Expression.ValueResult
    {
        if (this.lhs instanceof ImplicitLambdaArg || this.rhs instanceof ImplicitLambdaArg)
        {
            return ImplicitLambdaArg.makeImplicitFunction(this, [this.lhs, this.rhs], state, s => {
                const lhsrhs: Expression.ValueResult[] = [];
                const lhsValue = this.fetchSubExpression(this.lhs, s, lhsrhs);
                const rhsValue = this.fetchSubExpression(this.rhs, s, lhsrhs);
                try
                {
                    const result = this.getValueBinaryOp(lhsValue, rhsValue);
                    return this.result(result, s, [...lhsrhs]);
                }
                catch (e)
                {
                    if (!(e instanceof UserException))
                        throw e;
                    throw new EvaluationException(e, this, Explanation.ExecutionType.VALUE, s, [...lhsrhs]);
                }
            });
        }
        else
        {
            const lhsrhs: Expression.ValueResult[] = [];
            const lhsValue = this.fetchSubExpression(this.lhs, state, lhsrhs);
            const rhsValue = this.fetchSubExpression(this.rhs, state, lhsrhs);
            let result: Value;
            try
            {
                result = this.getValueBinaryOp(lhsValue, rhsValue);
            }
            catch (e)
            {
                if (!(e instanceof UserException))
                    throw e;
                throw new EvaluationException(e, this, Explanation.ExecutionType.VALUE, state, [...lhsrhs]);
            }
            return this.result(result, state, [...lhsrhs]);
        }
    }

    // This is allowed to throw UserException since it won't fetch any
    // sub-expressions and thus we can assume it is top of a stack:
    public abstract getValueBinaryOp(lhsValue: Expression.ValueResult, rhsValue: Expression.ValueResult): Value;

    public override check(dataLookup: Expression.ColumnLookup, typeState: TypeState, kind: Expression.ExpressionKind, _locationInfo: Expression.LocationInfo, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        const lambda = ImplicitLambdaArg.detectImplicitLambda(this, [this.lhs, this.rhs], typeState, onError);
        typeState = lambda.getSecond();
        const lhsChecked = this.lhs.check(dataLookup, typeState, this.getOperandKinds().getFirst(), this.argLocationInfo(), onError);
        if (lhsChecked === null)
            return null;
        const rhsChecked = this.rhs.check(dataLookup, lhsChecked.typeState, this.getOperandKinds().getSecond(), this.argLocationInfo(), onError);
        if (rhsChecked === null)
            return null;
        this.lhsType = lhsChecked;
        this.rhsType = rhsChecked;
        const checked = this.checkBinaryOp(dataLookup, typeState, kind, onError);
        return checked === null ? null : checked.applyToType(lambda.getFirst());
    }

    protected argLocationInfo(): Expression.LocationInfo
    {
        return Expression.LocationInfo.UNIT_DEFAULT;
    }

    protected abstract getOperandKinds(): Pair<Expression.ExpressionKind, Expression.ExpressionKind>;

    // Java: @RequiresNonNull({"lhsType", "rhsType"})
    protected abstract checkBinaryOp(data: Expression.ColumnLookup, typeState: TypeState, expressionKind: Expression.ExpressionKind, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null;

    public override _test_childMutationPoints(): Pair<Expression, (e: Expression) => Expression>[]
    {
        return [
            ...this.lhs._test_allMutationPoints().map(p => new Pair<Expression, (e: Expression) => Expression>(p.getFirst(), newLHS => this.copy(p.getSecond()(newLHS), this.rhs))),
            ...this.rhs._test_allMutationPoints().map(p => new Pair<Expression, (e: Expression) => Expression>(p.getFirst(), newRHS => this.copy(this.lhs, p.getSecond()(newRHS)))),
        ];
    }

    public override _test_typeFailure(r: JavaRandom, newExpressionOfDifferentType: Expression._test_TypeVary, _unitManager: UnitManager): Expression | null
    {
        // Most binary ops require same type, so this is typical (can always override):
        if (r.nextBoolean())
        {
            return this.copy(this.lhsType !== null && this.lhsType.typeExp.prune() instanceof NumTypeExp ? newExpressionOfDifferentType.getNonNumericType() : newExpressionOfDifferentType.getDifferentType(this.rhsType === null ? null : this.rhsType.typeExp), this.rhs);
        }
        else
        {
            return this.copy(this.lhs, this.rhsType !== null && this.rhsType.typeExp.prune() instanceof NumTypeExp ? newExpressionOfDifferentType.getNonNumericType() : newExpressionOfDifferentType.getDifferentType(this.lhsType === null ? null : this.lhsType.typeExp));
        }
    }

    public getLHS(): Expression
    {
        return this.lhs;
    }

    public getRHS(): Expression
    {
        return this.rhs;
    }

    public _test_getOperatorEntry(): string
    {
        return this.saveOp();
    }
}
