// Port of xyz.columnal.transformations.expression.ComparisonExpression (expressions module).
import type { JavaRandom } from "../../../java/JavaRandom.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import { TypeClassRequirements } from "../../../types/typeExp/TypeClassRequirements.js";
import { MutVar, NumTypeExp, TypeExp } from "../../../types/typeExp/TypeExps.js";
import { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { UserException } from "../../../utility-error/error/UserException.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import { Utility } from "../../../utility/utility/Utility.js";
import type { Value } from "../../../utility/utility/Value.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import type { EvaluateState } from "./EvaluateState.js";
import { EvaluationException } from "./EvaluationException.js";
import { Explanation } from "./explanation/Explanation.js";
import { Expression, NaryOpExpression, NaryOpShortCircuitExpression } from "./Expressions.js";
import { ExpressionUtil } from "./ExpressionUtil.js";
import type { QuickFix } from "./QuickFix.js";
import type { TypeState } from "./TypeState.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";

/**
 * Created by neil on 17/01/2017.
 */
export class ComparisonExpression extends NaryOpShortCircuitExpression
{
    private readonly operators: readonly ComparisonExpression.ComparisonOperator[];
    private type: TypeExp | null = null;

    public constructor(expressions: readonly Expression[], operators: readonly ComparisonExpression.ComparisonOperator[])
    {
        super(expressions);
        this.operators = operators;
    }

    public override copyNoNull(replacements: readonly Expression[]): NaryOpExpression
    {
        return new ComparisonExpression(replacements, this.operators);
    }

    protected override saveOp(index: number): string
    {
        return this.operators[index]!.saveOp();
    }

    public override checkNaryOp(dataLookup: Expression.ColumnLookup, state: TypeState, _kind: Expression.ExpressionKind, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        this.type = this.checkAllOperandsSameTypeAndNotPatterns(new MutVar(this, TypeClassRequirements.require("Comparable", this.operators[0]!.saveOp())), dataLookup, state, Expression.LocationInfo.UNIT_CONSTRAINED, onError, p => p.getOurType() instanceof NumTypeExp ? NaryOpExpression.customErrors([this, new Pair<TypeExp.TypeError | null, readonly QuickFix<Expression>[]>(new TypeExp.TypeError(StyledString.s("Mismatched units"), p.getAvailableTypesForError()), [
                ...ExpressionUtil.getFixesForMatchingNumericUnits(state, p),
        ])]) : NaryOpExpression.customErrors());
        if (this.type === null)
            return null;
        return onError.recordType(this, state, TypeExp.bool(this));
    }

    public override getValueNaryOp(state: EvaluateState): Expression.ValueResult
    {
        const usedValues: Expression.ValueResult[] = [];
        let cur = this.fetchSubExpression(this.expressions[0]!, state, usedValues).value;
        for (let i = 1; i < this.expressions.length; i++)
        {
            const next = this.fetchSubExpression(this.expressions[i]!, state, usedValues).value;
            try
            {
                if (!this.operators[i - 1]!.comparisonTrue(cur, next))
                {
                    return this.result(DataTypeUtility.value(false), state, [...usedValues]);
                }
            }
            catch (e)
            {
                if (!(e instanceof UserException))
                    throw e;
                throw new EvaluationException(e, this, Explanation.ExecutionType.VALUE, state, [...usedValues]);
            }
            cur = next;
        }
        return this.result(DataTypeUtility.value(true), state, [...usedValues]);
    }

    public override _test_typeFailure(r: JavaRandom, newExpressionOfDifferentType: Expression._test_TypeVary, _unitManager: UnitManager): Expression | null
    {
        const index = r.nextInt(this.expressions.length);
        return this.copy(this.makeNullList(index, newExpressionOfDifferentType.getDifferentType(this.type)));
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        return visitor.comparison(this, this.expressions, this.operators);
    }
}

export namespace ComparisonExpression
{
    // Java: an enum with per-constant methods
    export class ComparisonOperator
    {
        private constructor(private readonly javaName: string, public readonly ordinal: number, private readonly op: string, private readonly test: (c: number) => boolean)
        {
        }

        public static readonly LESS_THAN = new ComparisonOperator("LESS_THAN", 0, "<", c => c < 0);
        public static readonly LESS_THAN_OR_EQUAL_TO = new ComparisonOperator("LESS_THAN_OR_EQUAL_TO", 1, "<=", c => c <= 0);
        public static readonly GREATER_THAN = new ComparisonOperator("GREATER_THAN", 2, ">", c => c > 0);
        public static readonly GREATER_THAN_OR_EQUAL_TO = new ComparisonOperator("GREATER_THAN_OR_EQUAL_TO", 3, ">=", c => c >= 0);

        public static values(): ComparisonOperator[]
        {
            return [ComparisonOperator.LESS_THAN, ComparisonOperator.LESS_THAN_OR_EQUAL_TO, ComparisonOperator.GREATER_THAN, ComparisonOperator.GREATER_THAN_OR_EQUAL_TO];
        }

        public comparisonTrue(a: Value, b: Value): boolean
        {
            return this.test(Utility.compareValues(a, b));
        }

        public saveOp(): string
        {
            return this.op;
        }

        public name(): string
        {
            return this.javaName;
        }

        public toString(): string
        {
            return this.javaName;
        }

        public hashCode(): number
        {
            return this.ordinal;
        }

        public static parse(text: string): ComparisonOperator
        {
            const op = ComparisonOperator.values().find(candidate => candidate.saveOp() === text) ?? null;
            if (op === null)
                throw new UserException("Unparseable operator: \"" + text + "\"");
            return op;
        }
    }
}
