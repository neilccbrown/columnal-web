// Port of xyz.columnal.transformations.expression.visitor.ExpressionVisitorStream (expressions module).
// PORT-NOTE: Java returns Streams; here they are arrays (see docs/CONVENTIONS.md).  Where a
// caller relied on a Stream being lazy (to stop at the first item), it says so.
import type { ExpressionIdentifier } from "../../../../anns/Annotations.js";
import type { TemporalAccessor } from "../../../../java/time/TemporalAccessor.js";
import type { DateTimeInfo } from "../../../../types/data/datatype/DateTimeInfo.js";
import type { Either } from "../../../../utility-adt/utility/adt/Either.js";
import type { Pair } from "../../../../utility-adt/utility/adt/Pair.js";
import type { StyledString } from "../../../../utility-error/styled/StyledString.js";
import type { Decimal } from "../../../../java/JavaBigDecimal.js";
import type { AddSubtractExpression, AndExpression, ArrayExpression, BooleanLiteral, CallExpression, ComparisonExpression, DefineExpression, DivideExpression, EqualExpression, Expression, FieldAccessExpression, HasTypeExpression, IdentExpression, IfThenElseExpression, ImplicitLambdaArg, InvalidIdentExpression, InvalidOperatorExpression, LambdaExpression, MatchAnythingExpression, MatchExpression, NotEqualExpression, NumericLiteral, OrExpression, PlusMinusPatternExpression, RaiseExpression, RecordExpression, StringConcatExpression, StringLiteral, TemporalLiteral, TimesExpression, TypeLiteralExpression, UnitLiteralExpression } from "../Expressions.js";
import type { UnitExpression } from "../UnitExpressions.js";
import type { TypeExpression } from "../type/TypeExpressions.js";

import { Utility } from "../../../../utility/utility/Utility.js";
import type { ExpressionVisitor } from "./ExpressionVisitor.js";

export class ExpressionVisitorStream<T> implements ExpressionVisitor<T[]>
{
    public notEqual(_self: NotEqualExpression, lhs: Expression, rhs: Expression): T[]
    {
        return this.apply([lhs, rhs]);
    }

    // Java: apply(Expression...) and apply(ImmutableList<Expression>)
    private apply(expressions: readonly Expression[]): T[]
    {
        return expressions.flatMap(e => e.visit(this));
    }

    public divide(_self: DivideExpression, lhs: Expression, rhs: Expression): T[]
    {
        return this.apply([lhs, rhs]);
    }

    public addSubtract(_self: AddSubtractExpression, expressions: readonly Expression[], _ops: readonly AddSubtractExpression.AddSubtractOp[]): T[]
    {
        return this.apply(expressions);
    }

    public and(_self: AndExpression, expressions: readonly Expression[]): T[]
    {
        return this.apply(expressions);
    }

    public or(_self: OrExpression, expressions: readonly Expression[]): T[]
    {
        return this.apply(expressions);
    }

    public list(_self: ArrayExpression, items: readonly Expression[]): T[]
    {
        return this.apply(items);
    }

    public litBoolean(_self: BooleanLiteral, _value: boolean): T[]
    {
        return [];
    }

    public call(_self: CallExpression, callTarget: Expression, args: readonly Expression[]): T[]
    {
        return this.apply(Utility.prependToList(callTarget, args));
    }

    public comparison(_self: ComparisonExpression, expressions: readonly Expression[], _operators: readonly ComparisonExpression.ComparisonOperator[]): T[]
    {
        return this.apply(expressions);
    }

    public equal(_self: EqualExpression, expressions: readonly Expression[], _lastIsPattern: boolean): T[]
    {
        return this.apply(expressions);
    }

    public ident(_self: IdentExpression, _namespace: ExpressionIdentifier | null, _idents: readonly ExpressionIdentifier[], _isVariable: boolean): T[]
    {
        return [];
    }

    public ifThenElse(_self: IfThenElseExpression, condition: Expression, thenExpression: Expression, elseExpression: Expression): T[]
    {
        return this.apply([condition, thenExpression, elseExpression]);
    }

    public invalidIdent(_self: InvalidIdentExpression, _text: string): T[]
    {
        return [];
    }

    public implicitLambdaArg(_self: ImplicitLambdaArg): T[]
    {
        return [];
    }

    public invalidOps(_self: InvalidOperatorExpression, items: readonly Expression[]): T[]
    {
        return this.apply(items);
    }

    public matchAnything(_self: MatchAnythingExpression): T[]
    {
        return [];
    }

    public litNumber(_self: NumericLiteral, _value: Decimal, _unit: UnitExpression | null): T[]
    {
        return [];
    }

    public plusMinus(_self: PlusMinusPatternExpression, lhs: Expression, rhs: Expression): T[]
    {
        return this.apply([lhs, rhs]);
    }

    public raise(_self: RaiseExpression, lhs: Expression, rhs: Expression): T[]
    {
        return this.apply([lhs, rhs]);
    }

    public concatText(_self: StringConcatExpression, expressions: readonly Expression[]): T[]
    {
        return this.apply(expressions);
    }

    public litText(_self: StringLiteral, _value: string): T[]
    {
        return [];
    }

    public litTemporal(_self: TemporalLiteral, _literalType: DateTimeInfo.DateTimeType, _content: string, _value: Either<StyledString, TemporalAccessor>): T[]
    {
        return [];
    }

    public multiply(_self: TimesExpression, expressions: readonly Expression[]): T[]
    {
        return this.apply(expressions);
    }

    public litType(_self: TypeLiteralExpression, _type: TypeExpression): T[]
    {
        return [];
    }

    public litUnit(_self: UnitLiteralExpression, _unitExpression: UnitExpression): T[]
    {
        return [];
    }

    public match(_self: MatchExpression, expression: Expression, clauses: readonly MatchExpression.MatchClause[]): T[]
    {
        const expStream = expression.visit(this);
        return [...expStream, ...clauses.flatMap(clause => {
            // Must call patterns first:
            const patternsStream = Utility.mapListI(clause.getPatterns(), p => this.visitPattern(p)).flat();
            const outcomeStream = clause.getOutcome().visit(this);
            return [...patternsStream, ...outcomeStream];
        })];
    }

    public define(_self: DefineExpression, defines: readonly DefineExpression.DefineItem[], body: Expression): T[]
    {
        return [...defines.flatMap(e => e.typeOrDefinition.either<T[]>(x => x.visit(this), x => [...x.lhsPattern.visit(this), ...x.rhsValue.visit(this)])), ...body.visit(this)];
    }

    public hasType(_self: HasTypeExpression, _lhsVar: ExpressionIdentifier, rhsType: Expression): T[]
    {
        return this.apply([rhsType]);
    }

    public lambda(_self: LambdaExpression, parameters: readonly Expression[], body: Expression): T[]
    {
        return [...parameters.flatMap(e => e.visit(this)), ...body.visit(this)];
    }

    public record(_self: RecordExpression, members: readonly Pair<ExpressionIdentifier, Expression>[]): T[]
    {
        return members.flatMap(p => p.getSecond().visit(this));
    }

    public field(_self: FieldAccessExpression, lhsRecord: Expression, _fieldName: string): T[]
    {
        return lhsRecord.visit(this);
    }

    protected visitPattern(pattern: MatchExpression.Pattern): T[]
    {
        const patStream = pattern.getPattern().visit(this);
        return [...patStream, ...Utility.streamNullable(pattern.getGuard()).flatMap(g => g.visit(this))];
    }
}
