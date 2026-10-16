// Port of xyz.columnal.transformations.expression.ExpressionUtil (expressions module).
import type { ParseTree } from "antlr4ng";
import type { ExpressionIdentifier } from "../../../anns/Annotations.js";
import { javaEquals } from "../../../java/JavaObject.js";
import { javaReplace, javaTrim } from "../../../java/JavaString.js";
import { ColumnId } from "../../../identifiers/id/ColumnId.js";
import { TableId } from "../../../identifiers/id/TableId.js";
import { ExpressionLexer } from "../../../parsers/generated/ExpressionLexer.js";
import { ExpressionLexer2 } from "../../../parsers/generated/ExpressionLexer2.js";
import * as P1 from "../../../parsers/generated/ExpressionParser.js";
import * as P2 from "../../../parsers/generated/ExpressionParser2.js";
import { ExpressionParserVisitor } from "../../../parsers/generated/ExpressionParserVisitor.js";
import { ExpressionParser2Visitor } from "../../../parsers/generated/ExpressionParser2Visitor.js";
import { GrammarUtility } from "../../../parsers/grammar/GrammarUtility.js";
import { ExpressionVersion } from "../../../parsers/grammar/Versions.js";
import type { DataType } from "../../../types/data/datatype/DataType.js";
import { DateTimeInfo } from "../../../types/data/datatype/DateTimeInfo.js";
import type { TypeManager } from "../../../types/data/datatype/TypeManager.js";
import { Unit } from "../../../types/data/unit/Unit.js";
import { JellyType } from "../../../types/jellytype/JellyTypes.js";
import { NumTypeExp } from "../../../types/typeExp/TypeExps.js";
import { Either } from "../../../utility-adt/utility/adt/Either.js";
import { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../utility-error/error/InternalException.js";
import { UserException } from "../../../utility-error/error/UserException.js";
import type { StyledShowable } from "../../../utility-error/styled/StyledShowable.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import { Log } from "../../../utility/log/Log.js";
import { IdentifierUtility } from "../../../utility/utility/IdentifierUtility.js";
import { TranslationUtility } from "../../../utility/utility/TranslationUtility.js";
import { Utility } from "../../../utility/utility/Utility.js";
import { CanonicalSpan } from "./CanonicalSpan.js";
import {
    AddSubtractExpression, AndExpression, ArrayExpression, BooleanLiteral, CallExpression, ComparisonExpression,
    DefineExpression, DivideExpression, EqualExpression, type Expression, FieldAccessExpression, HasTypeExpression,
    IdentExpression, IfThenElseExpression, ImplicitLambdaArg, InvalidIdentExpression, InvalidOperatorExpression,
    LambdaExpression, MatchAnythingExpression, MatchExpression, type NaryOpExpression, NotEqualExpression, NumericLiteral,
    OrExpression, PlusMinusPatternExpression, RaiseExpression, RecordExpression, StringConcatExpression, StringLiteral,
    TemporalLiteral, TimesExpression, TypeLiteralExpression, UnitLiteralExpression,
} from "./Expressions.js";
import type { FunctionLookup } from "./function/FunctionLookup.js";
import { QuickFix } from "./QuickFix.js";
import { InvalidIdentTypeExpression, InvalidOpTypeExpression, TypeExpression } from "./type/TypeExpressions.js";
import type { TypeState } from "./TypeState.js";
import { InvalidSingleUnitExpression, UnitExpression } from "./UnitExpressions.js";
import { ExpressionVisitorStream } from "./visitor/ExpressionVisitorStream.js";

/** Java's unchecked RuntimeException, which the parse tree visitors throw (and parse catches). */
class RuntimeException extends Error
{
    public constructor(message?: string, cause?: unknown)
    {
        super(message, cause === undefined ? undefined : { cause });
        this.name = "RuntimeException";
    }
}

// Java: StringUtils.removeStart and StringUtils.removeEnd
function removeStart(s: string, remove: string): string
{
    return remove.length !== 0 && s.startsWith(remove) ? s.substring(remove.length) : s;
}

function removeEnd(s: string, remove: string): string
{
    return remove.length !== 0 && s.endsWith(remove) ? s.substring(0, s.length - remove.length) : s;
}

/**
 * Created by neil on 21/01/2017.
 */
export class ExpressionUtil
{
    // Parameter should be Expression/UnitExpression/etc
    // Java: makeCssClass(StyledShowable) and makeCssClass(String)
    public static makeCssClass(replacement: StyledShowable | string): string
    {
        if (typeof replacement !== "string")
            return ExpressionUtil.makeCssClass(replacement.toStyledString().toPlain());
        Log.debug("Munging: " + replacement);
        return "id-munged-" + [...replacement].map(c => c.codePointAt(0)!.toString()).join("-");
    }

    public static isCallTarget(expression: Expression): boolean
    {
        return expression instanceof IdentExpression;
    }

    public static tablesFromExpression(expression: Expression): TableId[]
    {
        return ExpressionUtil.tablesFromExpressions([expression]);
    }

    public static tablesFromExpressions(expressions: readonly Expression[]): TableId[]
    {
        return expressions.flatMap(e => e.visit(new class extends ExpressionVisitorStream<TableId>
        {
            public override ident(self: IdentExpression, namespace: ExpressionIdentifier | null, idents: readonly ExpressionIdentifier[], isVariable: boolean): TableId[]
            {
                if (namespace !== null)
                {
                    switch (namespace)
                    {
                        case "column":
                            if (idents.length === 2)
                                return [new TableId(idents[0]!)];
                            break;
                        case "table":
                            return [new TableId(idents[0]!)];
                    }
                }
                return super.ident(self, namespace, idents, isVariable);
            }
        }()));
    }

    public static columnsFromExpressions(expressions: readonly Expression[]): Pair<TableId | null, ColumnId>[]
    {
        return expressions.flatMap(e => e.visit(new class extends ExpressionVisitorStream<Pair<TableId | null, ColumnId>>
        {
            public override ident(self: IdentExpression, namespace: ExpressionIdentifier | null, idents: readonly ExpressionIdentifier[], isVariable: boolean): Pair<TableId | null, ColumnId>[]
            {
                if (namespace !== null)
                {
                    switch (namespace)
                    {
                        case "column":
                            if (idents.length === 2)
                                return [new Pair<TableId | null, ColumnId>(new TableId(idents[0]!), new ColumnId(idents[1]!))];
                            else if (idents.length === 1)
                                return [new Pair<TableId | null, ColumnId>(null, new ColumnId(idents[0]!))];
                            break;
                    }
                }
                return super.ident(self, namespace, idents, isVariable);
            }
        }()));
    }

    public static quickFixesForTypeError(typeManager: TypeManager, functionLookup: FunctionLookup, src: Expression, fix: DataType | null): QuickFix<Expression>[]
    {
        const quickFixes: QuickFix<Expression>[] = [];
        const makeTypeFix: QuickFix.QuickFixReplace<Expression> = () => {
            return TypeLiteralExpression.fixType(functionLookup, fix === null ? new InvalidOpTypeExpression([]) : TypeExpression.fromDataType(fix), src);
        };
        quickFixes.push(new QuickFix<Expression>(StyledString.s(TranslationUtility.getString("fix.setType")), [], src, makeTypeFix));
        if (fix !== null)
        {
            const fixFinal = fix;
            quickFixes.push(new QuickFix<Expression>(StyledString.s(TranslationUtility.getString("fix.setTypeTo", fix.toString())), [], src, () => TypeLiteralExpression.fixType(typeManager, functionLookup, JellyType.fromConcrete(fixFinal), src)));
        }
        return quickFixes;
    }

    public static getFixesForMatchingNumericUnits(state: TypeState, p: NaryOpExpression.TypeProblemDetails): QuickFix<Expression>[]
    {
        // Must be a units issue.  Check if fixing a numeric literal involved would make
        // the units match all non-literal units:
        const literals: Pair<NumericLiteral, Unit | null>[] = [];
        const nonLiteralUnits: (Unit | null)[] = [];
        for (let i = 0; i < p.expressions.length; i++)
        {
            const expression = p.expressions[i]!;
            if (expression instanceof NumericLiteral)
            {
                const n = expression;
                const unitExpression = n.getUnitExpression();
                let unit: Unit | null = null;
                if (unitExpression === null)
                    unit = Unit.SCALAR;
                else
                {
                    try
                    {
                        unit = unitExpression.asUnit(state.getUnitManager()).makeUnit(new Map());
                    }
                    catch (e)
                    {
                        if (e instanceof InternalException)
                            Log.log(e);
                        else if (!(e instanceof UnitExpression.UnitLookupException))
                            throw e;
                        // Could not find unit, leave it as null
                    }
                }
                literals.push(new Pair<NumericLiteral, Unit | null>(n, unit));
            }
            else
            {
                const type = p.getType(i);
                if (type !== null && !(type instanceof NumTypeExp))
                {
                    // Non-numeric type; definitely can't offer a sensible fix:
                    return [];
                }
                nonLiteralUnits.push(type === null ? null : type.unit.toConcreteUnit());
            }
        }
        Log.debug(">>> literals: " + Utility.listToString(literals));
        Log.debug(">>> non-literals: " + Utility.listToString(nonLiteralUnits));

        // For us to offer the quick fix, we need the following conditions: all non-literals
        // have the same known unit (and there is at least one non-literal).
        // (Java: Stream.distinct(), which uses equals)
        const uniqueNonLiteralUnits: Unit[] = [];
        for (const u of Utility.filterOutNulls(nonLiteralUnits))
        {
            if (!uniqueNonLiteralUnits.some(v => javaEquals(v, u)))
                uniqueNonLiteralUnits.push(u);
        }
        if (uniqueNonLiteralUnits.length === 1)
        {
            for (const literal of literals)
            {
                Log.debug("Us: " + p.getOurExpression().toString() + " literal: " + literal.getFirst().toString() + " match: " + String(literal.getFirst() === p.getOurExpression()));
                Log.debug("Non-literal unit: " + uniqueNonLiteralUnits[0]!.toString() + " us: " + String(literal.getSecond()));
                if (literal.getFirst() === p.getOurExpression() && !uniqueNonLiteralUnits[0]!.equals(literal.getSecond()))
                {
                    return [new QuickFix<Expression>(StyledString.s(TranslationUtility.getString("fix.changeUnit", uniqueNonLiteralUnits[0]!.toString())), [], p.getOurExpression(), () => {
                        return literal.getFirst().withUnit(uniqueNonLiteralUnits[0]!);
                    })];
                }
            }
        }
        return [];
    }

    public static parse(keyword: string | null, src: string, expressionVersion: ExpressionVersion, typeManager: TypeManager, functionLookup: FunctionLookup): Expression
    {
        if (keyword !== null)
        {
            src = javaTrim(src);
            if (src.startsWith(keyword))
                src = src.substring(keyword.length);
            else
                throw new UserException("Missing keyword: " + keyword);
        }
        try
        {
            switch (expressionVersion)
            {
                case ExpressionVersion.ONE:
                    return Utility.parseAsOne(javaReplace(javaReplace(src, "\r", ""), "\n", ""), s => new ExpressionLexer(s), t => new P1.ExpressionParser(t), p =>
                    {
                        return new CompileExpression(typeManager, functionLookup).visitTop(p.completeExpression().topLevelExpression());
                    });
                case ExpressionVersion.TWO:
                default:
                    return Utility.parseAsOne(javaReplace(javaReplace(src, "\r", ""), "\n", ""), s => new ExpressionLexer2(s), t => new P2.ExpressionParser2(t), p =>
                    {
                        return new CompileExpression2(typeManager, functionLookup).visitTop(p.completeExpression().topLevelExpression());
                    });
            }

        }
        catch (e)
        {
            // Java catches RuntimeException, which excludes its checked UserException and InternalException:
            if (e instanceof UserException || e instanceof InternalException)
                throw e;
            throw new UserException("Problem parsing expression \"" + src + "\"", e);
        }
    }
}

// The custom literals (unit{...}, type{...}, date{...}, ...), shared by both versions of the compiler.
// Java: a local class Lit in visitCustomLiteralExpression.
class Lit<A>
{
    public constructor(private readonly prefix: string, private readonly makeExpression: (a: A) => Expression, private readonly normalLoad: (s: string) => A, private readonly errorLoad: (s: string) => A)
    {
    }

    public load(src: string): Expression | null
    {
        if (src.startsWith(this.prefix))
        {
            src = removeStart(src, this.prefix);
            let value: A;
            try
            {
                value = this.normalLoad(src);
            }
            catch (e)
            {
                if (!(e instanceof InternalException || e instanceof UserException))
                    throw e;
                Log.log(e);
                value = this.errorLoad(src);
            }
            return this.makeExpression(value);
        }
        return null;
    }
}

function loadCustomLiteral(customLiteral: string): Expression
{
    const literalContent = removeEnd(customLiteral, "}");
    const DateTimeType = DateTimeInfo.DateTimeType;
    const loaders: Lit<unknown>[] = [
        new Lit<UnitExpression>("unit{", u => new UnitLiteralExpression(u), s => UnitExpression.load(s), s => InvalidSingleUnitExpression.identOrUnfinished(s)) as Lit<unknown>,
        new Lit<TypeExpression>("type{", t => new TypeLiteralExpression(t), t => TypeExpression.parseTypeExpression(t), s => InvalidIdentTypeExpression.identOrUnfinished(s),
        ) as Lit<unknown>,
        new Lit<string>("date{", s => new TemporalLiteral(DateTimeType.YEARMONTHDAY, s), s => s, s => s) as Lit<unknown>,
        new Lit<string>("dateym{", s => new TemporalLiteral(DateTimeType.YEARMONTH, s), s => s, s => s) as Lit<unknown>,
        new Lit<string>("time{", s => new TemporalLiteral(DateTimeType.TIMEOFDAY, s), s => s, s => s) as Lit<unknown>,
        new Lit<string>("datetime{", s => new TemporalLiteral(DateTimeType.DATETIME, s), s => s, s => s) as Lit<unknown>,
        new Lit<string>("datetimezoned{", s => new TemporalLiteral(DateTimeType.DATETIMEZONED, s), s => s, s => s) as Lit<unknown>,
    ];

    // Java: a lazy stream with findFirst, so stops at the first loader that matches
    for (const l of loaders)
    {
        const loaded = l.load(literalContent);
        if (loaded !== null)
            return loaded;
    }

    return InvalidIdentExpression.identOrUnfinished(literalContent.replaceAll("{", "_").replaceAll("}", "_"));
}

function loadNumericLiteral(ctx: P1.NumericLiteralContext | P2.NumericLiteralContext): Expression
{
    try
    {
        let unitExpression: UnitExpression | null;
        const curlied = ctx.CURLIED();
        if (curlied === null)
        {
            unitExpression = null;
        }
        else
        {
            let unitText = curlied.getText();
            unitText = removeStart(removeEnd(unitText, "}"), "{");
            unitExpression = UnitExpression.load(unitText);
        }
        const addOrSubtract = ctx.ADD_OR_SUBTRACT();
        return new NumericLiteral(Utility.parseNumber((addOrSubtract === null ? "" : addOrSubtract.getText()) + ctx.NUMBER().getText()), unitExpression);
    }
    catch (e)
    {
        if (!(e instanceof InternalException || e instanceof UserException))
            throw e;
        // PORT-NOTE: if the number (rather than the unit) fails to parse and there is no unit, Java
        // throws a NullPointerException while making this message; either way the parse fails.
        throw new RuntimeException("Error parsing unit: \"" + String(ctx.CURLIED()?.getText()) + "\"", e);
    }
}

function comparisonOperators(ops: readonly { getText(): string }[]): ComparisonExpression.ComparisonOperator[]
{
    try
    {
        return ops.map(op => ComparisonExpression.ComparisonOperator.parse(op.getText()));
    }
    catch (e)
    {
        if (!(e instanceof InternalException || e instanceof UserException))
            throw e;
        throw new RuntimeException(String(e), e);
    }
}

function addSubtractOps(ops: readonly { getText(): string }[]): AddSubtractExpression.AddSubtractOp[]
{
    return ops.map(op => op.getText() === "+" ? AddSubtractExpression.AddSubtractOp.ADD : AddSubtractExpression.AddSubtractOp.SUBTRACT);
}

// Java: Boolean.valueOf(String)
function booleanValueOf(s: string): boolean
{
    return s.toLowerCase() === "true";
}

// Java: CompileExpression.visitChildren and CompileExpression2.visitChildren (identical)
function compileChildren(visitor: { accept(c: ParseTree): Expression | null }, node: ParseTree): Expression
{
    let result: Expression | null = null;
    const n = node.getChildCount();

    for (let i = 0; i < n; ++i)
    {
        const c = node.getChild(i)!;
        const childResult = visitor.accept(c);
        if (childResult === null)
            break;
        result = childResult;
    }
    if (result === null)
        throw new RuntimeException("No CompileExpression rules matched for " + node.getText());
    else
        return result;
}

// PORT-NOTE: the grammar rules "match" and "constructor" are named "matchExpression" and
// "constructorExpression" here (see docs/CONVENTIONS.md), so visitMatch is visitMatchExpression
// and visitConstructor is visitConstructorExpression.  The Java visitors call the base class's
// visitExpression, visitTopLevelExpression and visitCallTarget, which visit the children; here
// those are the methods visitExpressionCtx, visitTop and visitCallTargetCtx.
class CompileExpression extends ExpressionParserVisitor<Expression>
{
    private readonly typeManager: TypeManager;
    private readonly functionLookup: FunctionLookup;

    public constructor(typeManager: TypeManager, functionLookup: FunctionLookup)
    {
        super();
        this.typeManager = typeManager;
        this.functionLookup = functionLookup;
    }

    public visitTop(ctx: P1.TopLevelExpressionContext): Expression
    {
        return this.visitChildren(ctx);
    }

    private visitExpressionCtx(ctx: P1.ExpressionContext): Expression
    {
        return this.visitChildren(ctx);
    }

    public override visitColumnRef = (ctx: P1.ColumnRefContext): Expression =>
    {
        const tableIdContext = ctx.tableId();
        const columnId = ctx.columnId();
        // (Java checks ctx.columnId() for null, which the grammar does not allow.)
        const tableName = tableIdContext === null ? null : new TableId(IdentifierUtility.fromParsed(tableIdContext.ident()));
        const columnName = new ColumnId(IdentifierUtility.fromParsed(columnId.ident()));
        // This isn't quite correct for the loading, but v1 was only
        // used during private beta, so we can live with incorrect loading:
        if (ctx.columnRefType().WHOLECOLUMN() !== null && tableName !== null)
            return IdentExpression.makeEntireColumnReference(tableName, columnName);
        else
            return IdentExpression.column(tableName, columnName);
    };

    public override visitNumericLiteral = (ctx: P1.NumericLiteralContext): Expression => loadNumericLiteral(ctx);

    public override visitStringLiteral = (ctx: P1.StringLiteralContext): Expression => new StringLiteral(ctx.RAW_STRING().getText());

    public override visitBooleanLiteral = (ctx: P1.BooleanLiteralContext): Expression => new BooleanLiteral(booleanValueOf(ctx.getText()));

    public override visitConstructorExpression = (ctx: P1.ConstructorExpressionContext): Expression =>
    {
        const type: ExpressionIdentifier | null = IdentifierUtility.fromParsed(ctx.typeName().ident());
        const tagName = IdentifierUtility.fromParsed(ctx.constructorName().ident());
        if (type !== null)
            return IdentExpression.tag(type, tagName);
        else
            return IdentExpression.tag(tagName);
    };

    public override visitNotEqualExpression = (ctx: P1.NotEqualExpressionContext): Expression => new NotEqualExpression(this.visitExpressionCtx(ctx.expression(0)!), this.visitExpressionCtx(ctx.expression(1)!));

    public override visitEqualExpression = (ctx: P1.EqualExpressionContext): Expression => new EqualExpression(Utility.mapList(ctx.expression(), e => this.visitExpressionCtx(e)), ctx.EQUALITY_PATTERN() !== null);

    public override visitAndExpression = (ctx: P1.AndExpressionContext): Expression => new AndExpression(Utility.mapList(ctx.expression(), e => this.visitExpressionCtx(e)));

    public override visitOrExpression = (ctx: P1.OrExpressionContext): Expression => new OrExpression(Utility.mapList(ctx.expression(), e => this.visitExpressionCtx(e)));

    public override visitRaisedExpression = (ctx: P1.RaisedExpressionContext): Expression => new RaiseExpression(this.visitExpressionCtx(ctx.expression(0)!), this.visitExpressionCtx(ctx.expression(1)!));

    public override visitDivideExpression = (ctx: P1.DivideExpressionContext): Expression => new DivideExpression(this.visitExpressionCtx(ctx.expression(0)!), this.visitExpressionCtx(ctx.expression(1)!));

    public override visitAddSubtractExpression = (ctx: P1.AddSubtractExpressionContext): Expression => new AddSubtractExpression(Utility.mapList(ctx.expression(), e => this.visitExpressionCtx(e)), addSubtractOps(ctx.ADD_OR_SUBTRACT()));

    public override visitGreaterThanExpression = (ctx: P1.GreaterThanExpressionContext): Expression => new ComparisonExpression(Utility.mapList(ctx.expression(), e => this.visitExpressionCtx(e)), comparisonOperators(ctx.GREATER_THAN()));

    public override visitLessThanExpression = (ctx: P1.LessThanExpressionContext): Expression => new ComparisonExpression(Utility.mapList(ctx.expression(), e => this.visitExpressionCtx(e)), comparisonOperators(ctx.LESS_THAN()));

    public override visitTimesExpression = (ctx: P1.TimesExpressionContext): Expression => new TimesExpression(Utility.mapList(ctx.expression(), e => this.visitExpressionCtx(e)));

    public override visitStringConcatExpression = (ctx: P1.StringConcatExpressionContext): Expression => new StringConcatExpression(Utility.mapList(ctx.expression(), e => this.visitExpressionCtx(e)));

    public override visitIfThenElseExpression = (ctx: P1.IfThenElseExpressionContext): Expression => IfThenElseExpression.unrecorded(this.visitTop(ctx.topLevelExpression(0)!), this.visitTop(ctx.topLevelExpression(1)!), this.visitTop(ctx.topLevelExpression(2)!));

    public override visitDefineExpression = (ctx: P1.DefineExpressionContext): Expression =>
    {
        return this.visitDefinitions(ctx.definition()).either<Expression>(bad => {
            const b: Expression[] = [];
            for (const expression of bad)
            {
                b.push(new InvalidIdentExpression("@define"));
                b.push(expression);
            }
            b.push(new InvalidIdentExpression("@then"));
            b.push(this.visitTop(ctx.topLevelExpression()));
            b.push(new InvalidIdentExpression("@enddefine"));
            return new InvalidOperatorExpression(b);
        }, mixed => DefineExpression.unrecorded(mixed, this.visitTop(ctx.topLevelExpression())));
    };

    private visitDefinitions(definitionContexts: readonly P1.DefinitionContext[]): Either<Expression[], Either<HasTypeExpression, DefineExpression.Definition>[]>
    {
        return compileDefinitions(definitionContexts, e => this.visitExpressionCtx(e as P1.ExpressionContext), h => this.visitHasTypeExpression(h as P1.HasTypeExpressionContext));
    }

    public override visitHasTypeExpression = (ctx: P1.HasTypeExpressionContext): Expression =>
    {
        const customLiteralExpression = this.visitCustomLiteralExpression(ctx.customLiteralExpression());
        return new HasTypeExpression(IdentifierUtility.fromParsed(ctx.varRef().ident()), customLiteralExpression);
    };

    public override visitLambdaExpression = (ctx: P1.LambdaExpressionContext): Expression =>
    {
        const es = ctx.topLevelExpression();
        return new LambdaExpression(Utility.mapListI(es.slice(0, es.length - 1), e => this.visitTop(e)), this.visitTop(es[es.length - 1]!));
    };

    public override visitCustomLiteralExpression = (ctx: P1.CustomLiteralExpressionContext): Expression => loadCustomLiteral(ctx.CUSTOM_LITERAL().getText());

    public override visitCallExpression = (ctx: P1.CallExpressionContext): Expression =>
    {
        const func = this.visitChildren(ctx.callTarget());

        const args = Utility.mapListI(ctx.topLevelExpression(), e => this.visitTop(e));

        return new CallExpression(func, args);
    };

    public override visitStandardFunction = (ctx: P1.StandardFunctionContext): Expression =>
    {
        const functionName = IdentifierUtility.fromParsed(ctx.ident());
        return IdentExpression.function([functionName]);
    };

    public override visitMatchExpression = (ctx: P1.MatchExpressionContext): Expression =>
    {
        const clauses: MatchExpression.MatchClause[] = [];
        for (const matchClauseContext of ctx.matchClause())
        {
            const patterns: MatchExpression.Pattern[] = [];
            for (const patternContext of matchClauseContext.pattern())
            {
                const guardExpression = patternContext.topLevelExpression().length < 2 ? null : patternContext.topLevelExpression(1)!;
                const guard = guardExpression === null ? null : this.visitTop(guardExpression);
                patterns.push(new MatchExpression.Pattern(this.visitTop(patternContext.topLevelExpression(0)!), guard));
            }
            clauses.push(new MatchExpression.MatchClause(new CanonicalSpan(0, 0), patterns, this.visitTop(matchClauseContext.topLevelExpression())));
        }
        return new MatchExpression(new CanonicalSpan(0, 0), this.visitTop(ctx.topLevelExpression()), clauses, new CanonicalSpan(0, 0));
    };

    public override visitArrayExpression = (ctx: P1.ArrayExpressionContext): Expression => new ArrayExpression(Utility.mapListI(ctx.topLevelExpression(), c => this.visitTop(c)));

    public override visitRecordExpression = (ctx: P1.RecordExpressionContext): Expression =>
    {
        const members: Pair<ExpressionIdentifier, Expression>[] = [];
        for (let i = 0; i < ctx.ident().length; i++)
        {
            members.push(new Pair(IdentifierUtility.fromParsed(ctx.ident(i)!), this.visitTop(ctx.topLevelExpression(i)!)));
        }
        return new RecordExpression(members);
    };

    public override visitFieldAccessExpression = (ctx: P1.FieldAccessExpressionContext): Expression => new FieldAccessExpression(this.visitExpressionCtx(ctx.expression()), IdentifierUtility.fromParsed(ctx.ident()));

    public override visitBracketedExpression = (ctx: P1.BracketedExpressionContext): Expression => this.visitTop(ctx.topLevelExpression());

    public override visitVarRef = (ctx: P1.VarRefContext): Expression => IdentExpression.load(IdentifierUtility.fromParsed(ctx.ident()));

    public override visitUnfinished = (ctx: P1.UnfinishedContext): Expression => new InvalidIdentExpression(GrammarUtility.processEscapes(ctx.RAW_STRING().getText(), false));

    public override visitImplicitLambdaParam = (_ctx: P1.ImplicitLambdaParamContext): Expression => new ImplicitLambdaArg();

    public override visitPlusMinusPattern = (ctx: P1.PlusMinusPatternContext): Expression => new PlusMinusPatternExpression(this.visitExpressionCtx(ctx.expression(0)!), this.visitExpressionCtx(ctx.expression(1)!));

    public override visitAny = (_ctx: P1.AnyContext): Expression => new MatchAnythingExpression();

    public override visitInvalidOpExpression = (ctx: P1.InvalidOpExpressionContext): Expression => new InvalidOperatorExpression(Utility.mapListI(ctx.invalidOpItem(), c => this.visitExpressionCtx(c.expression())));

    public override visitChildren(node: ParseTree): Expression
    {
        return compileChildren({ accept: c => c.accept(this) }, node);
    }

    public _unused(): [TypeManager, FunctionLookup]
    {
        return [this.typeManager, this.functionLookup];
    }
}

class CompileExpression2 extends ExpressionParser2Visitor<Expression>
{
    private readonly typeManager: TypeManager;
    private readonly functionLookup: FunctionLookup;

    public constructor(typeManager: TypeManager, functionLookup: FunctionLookup)
    {
        super();
        this.typeManager = typeManager;
        this.functionLookup = functionLookup;
    }

    public visitTop(ctx: P2.TopLevelExpressionContext): Expression
    {
        return this.visitChildren(ctx);
    }

    private visitExpressionCtx(ctx: P2.ExpressionContext): Expression
    {
        return this.visitChildren(ctx);
    }

    public override visitNumericLiteral = (ctx: P2.NumericLiteralContext): Expression => loadNumericLiteral(ctx);

    public override visitStringLiteral = (ctx: P2.StringLiteralContext): Expression => new StringLiteral(ctx.RAW_STRING().getText());

    public override visitBooleanLiteral = (ctx: P2.BooleanLiteralContext): Expression => new BooleanLiteral(booleanValueOf(ctx.getText()));

    public override visitNotEqualExpression = (ctx: P2.NotEqualExpressionContext): Expression => new NotEqualExpression(this.visitExpressionCtx(ctx.expression(0)!), this.visitExpressionCtx(ctx.expression(1)!));

    public override visitEqualExpression = (ctx: P2.EqualExpressionContext): Expression => new EqualExpression(Utility.mapList(ctx.expression(), e => this.visitExpressionCtx(e)), ctx.EQUALITY_PATTERN() !== null);

    public override visitAndExpression = (ctx: P2.AndExpressionContext): Expression => new AndExpression(Utility.mapList(ctx.expression(), e => this.visitExpressionCtx(e)));

    public override visitOrExpression = (ctx: P2.OrExpressionContext): Expression => new OrExpression(Utility.mapList(ctx.expression(), e => this.visitExpressionCtx(e)));

    public override visitRaisedExpression = (ctx: P2.RaisedExpressionContext): Expression => new RaiseExpression(this.visitExpressionCtx(ctx.expression(0)!), this.visitExpressionCtx(ctx.expression(1)!));

    public override visitDivideExpression = (ctx: P2.DivideExpressionContext): Expression => new DivideExpression(this.visitExpressionCtx(ctx.expression(0)!), this.visitExpressionCtx(ctx.expression(1)!));

    public override visitAddSubtractExpression = (ctx: P2.AddSubtractExpressionContext): Expression => new AddSubtractExpression(Utility.mapList(ctx.expression(), e => this.visitExpressionCtx(e)), addSubtractOps(ctx.ADD_OR_SUBTRACT()));

    public override visitGreaterThanExpression = (ctx: P2.GreaterThanExpressionContext): Expression => new ComparisonExpression(Utility.mapList(ctx.expression(), e => this.visitExpressionCtx(e)), comparisonOperators(ctx.GREATER_THAN()));

    public override visitLessThanExpression = (ctx: P2.LessThanExpressionContext): Expression => new ComparisonExpression(Utility.mapList(ctx.expression(), e => this.visitExpressionCtx(e)), comparisonOperators(ctx.LESS_THAN()));

    public override visitTimesExpression = (ctx: P2.TimesExpressionContext): Expression => new TimesExpression(Utility.mapList(ctx.expression(), e => this.visitExpressionCtx(e)));

    public override visitStringConcatExpression = (ctx: P2.StringConcatExpressionContext): Expression => new StringConcatExpression(Utility.mapList(ctx.expression(), e => this.visitExpressionCtx(e)));

    public override visitIfThenElseExpression = (ctx: P2.IfThenElseExpressionContext): Expression => IfThenElseExpression.unrecorded(this.visitTop(ctx.topLevelExpression(0)!), this.visitTop(ctx.topLevelExpression(1)!), this.visitTop(ctx.topLevelExpression(2)!));

    public override visitDefineExpression = (ctx: P2.DefineExpressionContext): Expression =>
    {
        return this.visitDefinitions(ctx.definition()).either<Expression>(bad => {
            const b: Expression[] = [];
            for (const expression of bad)
            {
                b.push(new InvalidIdentExpression("@define"));
                b.push(expression);
            }
            b.push(new InvalidIdentExpression("@then"));
            b.push(this.visitTop(ctx.topLevelExpression()));
            b.push(new InvalidIdentExpression("@enddefine"));
            return new InvalidOperatorExpression(b);
        }, mixed => DefineExpression.unrecorded(mixed, this.visitTop(ctx.topLevelExpression())));
    };

    private visitDefinitions(definitionContexts: readonly P2.DefinitionContext[]): Either<Expression[], Either<HasTypeExpression, DefineExpression.Definition>[]>
    {
        return compileDefinitions(definitionContexts, e => this.visitExpressionCtx(e as P2.ExpressionContext), h => this.visitHasTypeExpression(h as P2.HasTypeExpressionContext));
    }

    public override visitHasTypeExpression = (ctx: P2.HasTypeExpressionContext): Expression =>
    {
        const customLiteralExpression = this.visitCustomLiteralExpression(ctx.customLiteralExpression());
        return new HasTypeExpression(IdentifierUtility.fromParsed(ctx.ident().singleIdent(ctx.ident().singleIdent().length - 1)!), customLiteralExpression);
    };

    public override visitLambdaExpression = (ctx: P2.LambdaExpressionContext): Expression =>
    {
        const es = ctx.topLevelExpression();
        return new LambdaExpression(Utility.mapListI(es.slice(0, es.length - 1), e => this.visitTop(e)), this.visitTop(es[es.length - 1]!));
    };

    public override visitCustomLiteralExpression = (ctx: P2.CustomLiteralExpressionContext): Expression => loadCustomLiteral(ctx.CUSTOM_LITERAL().getText());

    public override visitCallExpression = (ctx: P2.CallExpressionContext): Expression =>
    {
        const func = this.visitChildren(ctx.callTarget());

        const args = Utility.mapListI(ctx.topLevelExpression(), e => this.visitTop(e));

        return new CallExpression(func, args);
    };

    public override visitMatchExpression = (ctx: P2.MatchExpressionContext): Expression =>
    {
        const clauses: MatchExpression.MatchClause[] = [];
        for (const matchClauseContext of ctx.matchClause())
        {
            const patterns: MatchExpression.Pattern[] = [];
            for (const patternContext of matchClauseContext.pattern())
            {
                const guardExpression = patternContext.topLevelExpression().length < 2 ? null : patternContext.topLevelExpression(1)!;
                const guard = guardExpression === null ? null : this.visitTop(guardExpression);
                patterns.push(new MatchExpression.Pattern(this.visitTop(patternContext.topLevelExpression(0)!), guard));
            }
            clauses.push(new MatchExpression.MatchClause(new CanonicalSpan(0, 0), patterns, this.visitTop(matchClauseContext.topLevelExpression())));
        }
        return new MatchExpression(new CanonicalSpan(0, 0), this.visitTop(ctx.topLevelExpression()), clauses, new CanonicalSpan(0, 0));
    };

    public override visitArrayExpression = (ctx: P2.ArrayExpressionContext): Expression => new ArrayExpression(Utility.mapListI(ctx.topLevelExpression(), c => this.visitTop(c)));

    public override visitRecordExpression = (ctx: P2.RecordExpressionContext): Expression =>
    {
        const members: Pair<ExpressionIdentifier, Expression>[] = [];
        for (let i = 0; i < ctx.singleIdent().length; i++)
        {
            members.push(new Pair(IdentifierUtility.fromParsed(ctx.singleIdent(i)!), this.visitTop(ctx.topLevelExpression(i)!)));
        }
        return new RecordExpression(members);
    };

    public override visitIdent = (ctx: P2.IdentContext): Expression =>
    {
        const namespaceContext = ctx.namespace();
        const namespace: ExpressionIdentifier | null = namespaceContext === null ? null : IdentifierUtility.fromParsed(namespaceContext.singleIdent());

        return IdentExpression.load(namespace, Utility.mapListI(ctx.singleIdent(), s => IdentifierUtility.fromParsed(s)));
    };

    public override visitFieldAccessExpression = (ctx: P2.FieldAccessExpressionContext): Expression =>
    {
        const lhs = this.visitExpressionCtx(ctx.expression(0)!);
        const rhs = this.visitExpressionCtx(ctx.expression(1)!);
        return FieldAccessExpression.fromBinary(lhs, rhs);
    };

    public override visitBracketedExpression = (ctx: P2.BracketedExpressionContext): Expression => this.visitTop(ctx.topLevelExpression());

    public override visitUnfinished = (ctx: P2.UnfinishedContext): Expression => new InvalidIdentExpression(GrammarUtility.processEscapes(ctx.RAW_STRING().getText(), false));

    public override visitImplicitLambdaParam = (_ctx: P2.ImplicitLambdaParamContext): Expression => new ImplicitLambdaArg();

    public override visitPlusMinusPattern = (ctx: P2.PlusMinusPatternContext): Expression => new PlusMinusPatternExpression(this.visitExpressionCtx(ctx.expression(0)!), this.visitExpressionCtx(ctx.expression(1)!));

    public override visitAny = (_ctx: P2.AnyContext): Expression => new MatchAnythingExpression();

    public override visitInvalidOpExpression = (ctx: P2.InvalidOpExpressionContext): Expression => new InvalidOperatorExpression(Utility.mapListI(ctx.invalidOpItem(), c => this.visitExpressionCtx(c.expression())));

    public override visitChildren(node: ParseTree): Expression
    {
        return compileChildren({ accept: c => c.accept(this) }, node);
    }

    public _unused(): [TypeManager, FunctionLookup]
    {
        return [this.typeManager, this.functionLookup];
    }
}

// Java: visitDefinitions in CompileExpression and CompileExpression2 (identical apart from the context types)
function compileDefinitions(definitionContexts: readonly (P1.DefinitionContext | P2.DefinitionContext)[], visitExpression: (e: P1.ExpressionContext | P2.ExpressionContext) => Expression, visitHasTypeExpression: (h: P1.HasTypeExpressionContext | P2.HasTypeExpressionContext) => Expression): Either<Expression[], Either<HasTypeExpression, DefineExpression.Definition>[]>
{
    // Java: an Either of two ImmutableList.Builders
    let builders: Either<Expression[], Either<HasTypeExpression, DefineExpression.Definition>[]> = Either.right<Expression[], Either<HasTypeExpression, DefineExpression.Definition>[]>([]);

    for (const def of definitionContexts)
    {
        const expressions: readonly (P1.ExpressionContext | P2.ExpressionContext)[] = def.expression();
        if (expressions.length > 0)
        {
            const lhs = visitExpression(expressions[0]!);
            const rhs = visitExpression(expressions[1]!);
            builders.either_(b => { b.push(new EqualExpression([lhs, rhs], false)); }, b => { b.push(Either.right(new DefineExpression.Definition(lhs, rhs))); });
        }
        else
        {
            const expression = visitHasTypeExpression(def.hasTypeExpression()!);
            if (!(expression instanceof HasTypeExpression))
            {
                builders = Either.left<Expression[], Either<HasTypeExpression, DefineExpression.Definition>[]>(builders.either<Expression[]>(b => b, mixed => {
                    const b: Expression[] = [];
                    b.push(...Utility.mapListI(mixed, e => e.either<Expression>(x => x, x => new EqualExpression([x.lhsPattern, x.rhsValue], false))));
                    return b;
                }));
            }

            builders.either_(b => { b.push(expression); }, b => { b.push(Either.left(expression as HasTypeExpression)); });
        }
    }

    return builders.mapBoth(b => [...b], b => [...b]);
}
