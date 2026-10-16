// Port of xyz.columnal.transformations.expression.visitor.ExpressionVisitor (expressions module).
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

export interface ExpressionVisitor<T>
{
    notEqual(self: NotEqualExpression, lhs: Expression, rhs: Expression): T;
    divide(self: DivideExpression, lhs: Expression, rhs: Expression): T;

    addSubtract(self: AddSubtractExpression, expressions: readonly Expression[], ops: readonly AddSubtractExpression.AddSubtractOp[]): T;

    and(self: AndExpression, expressions: readonly Expression[]): T;
    or(self: OrExpression, expressions: readonly Expression[]): T;

    list(self: ArrayExpression, items: readonly Expression[]): T;

    litBoolean(self: BooleanLiteral, value: boolean): T;

    call(self: CallExpression, callTarget: Expression, args: readonly Expression[]): T;

    comparison(self: ComparisonExpression, expressions: readonly Expression[], operators: readonly ComparisonExpression.ComparisonOperator[]): T;
    // Singular name to avoid clash with Object.equals
    equal(self: EqualExpression, expressions: readonly Expression[], lastIsPattern: boolean): T;

    ident(self: IdentExpression, namespace: ExpressionIdentifier | null, idents: readonly ExpressionIdentifier[], isVariable: boolean): T;

    ifThenElse(self: IfThenElseExpression, condition: Expression, thenExpression: Expression, elseExpression: Expression): T;

    invalidIdent(self: InvalidIdentExpression, text: string): T;

    implicitLambdaArg(self: ImplicitLambdaArg): T;

    invalidOps(self: InvalidOperatorExpression, items: readonly Expression[]): T;

    matchAnything(self: MatchAnythingExpression): T;

    litNumber(self: NumericLiteral, value: Decimal, unit: UnitExpression | null): T;

    plusMinus(self: PlusMinusPatternExpression, lhs: Expression, rhs: Expression): T;

    raise(self: RaiseExpression, lhs: Expression, rhs: Expression): T;

    concatText(self: StringConcatExpression, expressions: readonly Expression[]): T;

    litText(self: StringLiteral, rawValue: string): T;

    litTemporal(self: TemporalLiteral, literalType: DateTimeInfo.DateTimeType, content: string, value: Either<StyledString, TemporalAccessor>): T;

    multiply(self: TimesExpression, expressions: readonly Expression[]): T;

    litType(self: TypeLiteralExpression, type: TypeExpression): T;

    litUnit(self: UnitLiteralExpression, unitExpression: UnitExpression): T;

    match(self: MatchExpression, expression: Expression, clauses: readonly MatchExpression.MatchClause[]): T;

    define(self: DefineExpression, defines: readonly DefineExpression.DefineItem[], body: Expression): T;

    hasType(self: HasTypeExpression, lhsVar: ExpressionIdentifier, rhsType: Expression): T;

    lambda(self: LambdaExpression, parameters: readonly Expression[], body: Expression): T;

    record(self: RecordExpression, members: readonly Pair<ExpressionIdentifier, Expression>[]): T;

    field(self: FieldAccessExpression, lhsRecord: Expression, fieldName: string): T;
}
