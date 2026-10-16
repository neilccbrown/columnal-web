// Port of xyz.columnal.transformations.expression.visitor.ExpressionVisitorFlat (expressions module).
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

import type { ExpressionVisitor } from "./ExpressionVisitor.js";

export abstract class ExpressionVisitorFlat<T> implements ExpressionVisitor<T>
{
    protected abstract makeDef(expression: Expression): T;

    public notEqual(self: NotEqualExpression, _lhs: Expression, _rhs: Expression): T
    {
        return this.makeDef(self);
    }

    public divide(self: DivideExpression, _lhs: Expression, _rhs: Expression): T
    {
        return this.makeDef(self);
    }

    public addSubtract(self: AddSubtractExpression, _expressions: readonly Expression[], _ops: readonly AddSubtractExpression.AddSubtractOp[]): T
    {
        return this.makeDef(self);
    }

    public and(self: AndExpression, _expressions: readonly Expression[]): T
    {
        return this.makeDef(self);
    }

    public or(self: OrExpression, _expressions: readonly Expression[]): T
    {
        return this.makeDef(self);
    }

    public list(self: ArrayExpression, _items: readonly Expression[]): T
    {
        return this.makeDef(self);
    }

    public litBoolean(self: BooleanLiteral, _value: boolean): T
    {
        return this.makeDef(self);
    }

    public call(self: CallExpression, _callTarget: Expression, _args: readonly Expression[]): T
    {
        return this.makeDef(self);
    }

    public comparison(self: ComparisonExpression, _expressions: readonly Expression[], _operators: readonly ComparisonExpression.ComparisonOperator[]): T
    {
        return this.makeDef(self);
    }

    public equal(self: EqualExpression, _expressions: readonly Expression[], _lastIsPattern: boolean): T
    {
        return this.makeDef(self);
    }

    public ident(self: IdentExpression, _namespace: ExpressionIdentifier | null, _idents: readonly ExpressionIdentifier[], _isVariable: boolean): T
    {
        return this.makeDef(self);
    }

    public ifThenElse(self: IfThenElseExpression, _condition: Expression, _thenExpression: Expression, _elseExpression: Expression): T
    {
        return this.makeDef(self);
    }

    public invalidIdent(self: InvalidIdentExpression, _text: string): T
    {
        return this.makeDef(self);
    }

    public implicitLambdaArg(self: ImplicitLambdaArg): T
    {
        return this.makeDef(self);
    }

    public invalidOps(self: InvalidOperatorExpression, _items: readonly Expression[]): T
    {
        return this.makeDef(self);
    }

    public matchAnything(self: MatchAnythingExpression): T
    {
        return this.makeDef(self);
    }

    public litNumber(self: NumericLiteral, _value: Decimal, _unit: UnitExpression | null): T
    {
        return this.makeDef(self);
    }

    public plusMinus(self: PlusMinusPatternExpression, _lhs: Expression, _rhs: Expression): T
    {
        return this.makeDef(self);
    }

    public raise(self: RaiseExpression, _lhs: Expression, _rhs: Expression): T
    {
        return this.makeDef(self);
    }

    public concatText(self: StringConcatExpression, _expressions: readonly Expression[]): T
    {
        return this.makeDef(self);
    }

    public litText(self: StringLiteral, _rawValue: string): T
    {
        return this.makeDef(self);
    }

    public litTemporal(self: TemporalLiteral, _literalType: DateTimeInfo.DateTimeType, _content: string, _value: Either<StyledString, TemporalAccessor>): T
    {
        return this.makeDef(self);
    }

    public multiply(self: TimesExpression, _expressions: readonly Expression[]): T
    {
        return this.makeDef(self);
    }

    public litType(self: TypeLiteralExpression, _type: TypeExpression): T
    {
        return this.makeDef(self);
    }

    public litUnit(self: UnitLiteralExpression, _unitExpression: UnitExpression): T
    {
        return this.makeDef(self);
    }

    public match(self: MatchExpression, _expression: Expression, _clauses: readonly MatchExpression.MatchClause[]): T
    {
        return this.makeDef(self);
    }

    public define(self: DefineExpression, _defines: readonly DefineExpression.DefineItem[], _body: Expression): T
    {
        return this.makeDef(self);
    }

    public hasType(self: HasTypeExpression, _lhsVar: ExpressionIdentifier, _rhsType: Expression): T
    {
        return this.makeDef(self);
    }

    public lambda(self: LambdaExpression, _parameters: readonly Expression[], _body: Expression): T
    {
        return this.makeDef(self);
    }

    public record(self: RecordExpression, _members: readonly Pair<ExpressionIdentifier, Expression>[]): T
    {
        return this.makeDef(self);
    }

    public field(self: FieldAccessExpression, _lhsRecord: Expression, _fieldName: string): T
    {
        return this.makeDef(self);
    }
}
