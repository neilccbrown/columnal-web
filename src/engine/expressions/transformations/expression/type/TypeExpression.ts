// Port of xyz.columnal.transformations.expression.type.TypeExpression (expressions module).
// Load through TypeExpressions.ts (see "Class hierarchies split across files" in docs/CONVENTIONS.md).
import type { ExpressionIdentifier } from "../../../../anns/Annotations.js";
import { javaStringCompare } from "../../../../java/JavaObject.js";
import { FormatLexer } from "../../../../parsers/generated/FormatLexer.js";
import { FormatParser, type ApplyArgumentExpressionContext, type ApplyTypeExpressionContext, type ArrayTypeExpressionContext, type InvalidOpsTypeExpressionContext, type RecordTypeExpressionContext, type TypeExpressionContext, type TypeExpressionTerminalContext } from "../../../../parsers/generated/FormatParser.js";
import { FormatParserVisitor } from "../../../../parsers/generated/FormatParserVisitor.js";
import type { ParseTree } from "antlr4ng";
import { TableAndColumnRenames } from "../../../../identifiers/id/TableAndColumnRenames.js";
import { DataType, type DataTypeVisitorEx, type TagType } from "../../../../types/data/datatype/DataType.js";
import { DateTimeInfo } from "../../../../types/data/datatype/DateTimeInfo.js";
import type { NumberInfo } from "../../../../types/data/datatype/NumberInfo.js";
import type { TypeId } from "../../../../types/data/datatype/TypeId.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../types/data/unit/Unit.js";
import type { JellyType, JellyTypeVisitorEx } from "../../../../types/jellytype/JellyTypes.js";
import type { JellyTypeRecord } from "../../../../types/jellytype/JellyTypes.js";
import type { JellyUnit } from "../../../../types/jellytype/JellyUnit.js";
import { Either } from "../../../../utility-adt/utility/adt/Either.js";
import { Pair } from "../../../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../../utility-error/error/InternalException.js";
import { UnimplementedException } from "../../../../utility-error/error/UnimplementedException.js";
import { UserException } from "../../../../utility-error/error/UserException.js";
import type { StyledShowable } from "../../../../utility-error/styled/StyledShowable.js";
import type { StyledString } from "../../../../utility-error/styled/StyledString.js";
import { IdentifierUtility } from "../../../../utility/utility/IdentifierUtility.js";
import { Utility } from "../../../../utility/utility/Utility.js";
import { Expression } from "../Expressions.js";
import type { QuickFix } from "../QuickFix.js";
import type { Replaceable } from "../Replaceable.js";
import { UnitExpression } from "../UnitExpressions.js";
import { IdentTypeExpression, InvalidIdentTypeExpression, InvalidOpTypeExpression, ListTypeExpression, NumberTypeExpression, RecordTypeExpression, TypeApplyExpression, TypePrimitiveLiteral, UnitLiteralTypeExpression } from "./TypeExpressions.js";

export abstract class TypeExpression implements StyledShowable, Replaceable<TypeExpression>
{
    public static fromDataType(dataType: DataType): TypeExpression
    {
        const visitor: DataTypeVisitorEx<TypeExpression> = {
            number(numberInfo: NumberInfo): TypeExpression
            {
                return new NumberTypeExpression(UnitExpression.load(numberInfo.getUnit()));
            },

            text(): TypeExpression
            {
                return new TypePrimitiveLiteral(dataType);
            },

            date(_dateTimeInfo: DateTimeInfo): TypeExpression
            {
                return new TypePrimitiveLiteral(dataType);
            },

            bool(): TypeExpression
            {
                return new TypePrimitiveLiteral(dataType);
            },

            tagged(typeName: TypeId, typeVars: readonly Either<Unit, DataType>[], _tags: readonly TagType<DataType>[]): TypeExpression
            {
                if (typeVars.length === 0)
                    return new IdentTypeExpression(typeName.getRaw());
                const args: Either<UnitExpression, TypeExpression>[] = [];
                for (const typeVar of typeVars)
                {
                    args.push(typeVar.mapBothInt<UnitExpression, TypeExpression>(u => UnitExpression.load(u), t => TypeExpression.fromDataType(t)));
                }
                return new TypeApplyExpression(typeName.getRaw(), args);
            },

            record(fields: ReadonlyMap<ExpressionIdentifier, DataType>): TypeExpression
            {
                const b: Pair<ExpressionIdentifier, TypeExpression>[] = [];
                for (const [key, value] of [...fields].sort((x, y) => javaStringCompare(x[0], y[0])))
                {
                    b.push(new Pair(key, TypeExpression.fromDataType(value)));
                }
                return new RecordTypeExpression(b);
            },

            // PORT-NOTE: Java also allows a null inner type (an empty list), giving an
            // InvalidIdentTypeExpression(""); the port's DataType.array never has a null inner type.
            array(inner: DataType): TypeExpression
            {
                return new ListTypeExpression(TypeExpression.fromDataType(inner));
            },

            function(argTypes: readonly DataType[], resultType: DataType): TypeExpression
            {
                return new TypeApplyExpression("Function", Utility.mapListInt(Utility.concatI(argTypes, [resultType]), t => Either.right<UnitExpression, TypeExpression>(TypeExpression.fromDataType(t))));
            },
        };
        return dataType.apply(visitor);
    }

    public static fromJellyType(original: JellyType, mgr: TypeManager): TypeExpression
    {
        const visitor: JellyTypeVisitorEx<TypeExpression> = {
            number(unit: JellyUnit): TypeExpression
            {
                return new NumberTypeExpression(UnitExpression.load(unit));
            },

            text(): TypeExpression
            {
                return new TypePrimitiveLiteral(original.makeDataType(new Map(), mgr));
            },

            date(_dateTimeInfo: DateTimeInfo): TypeExpression
            {
                return new TypePrimitiveLiteral(original.makeDataType(new Map(), mgr));
            },

            bool(): TypeExpression
            {
                return new TypePrimitiveLiteral(original.makeDataType(new Map(), mgr));
            },

            applyTagged(typeName: TypeId, typeVars: readonly Either<JellyUnit, JellyType>[]): TypeExpression
            {
                if (typeVars.length === 0)
                    return new IdentTypeExpression(typeName.getRaw());
                const args: Either<UnitExpression, TypeExpression>[] = [];
                for (const typeVar of typeVars)
                {
                    args.push(typeVar.mapBothEx<UnitExpression, TypeExpression>(u => UnitExpression.load(u), t => TypeExpression.fromJellyType(t, mgr)));
                }
                return new TypeApplyExpression(typeName.getRaw(), args);
            },

            record(fields: ReadonlyMap<ExpressionIdentifier, JellyTypeRecord.Field>, _complete: boolean): TypeExpression
            {
                const b: Pair<ExpressionIdentifier, TypeExpression>[] = [];
                for (const [key, value] of [...fields].sort((x, y) => javaStringCompare(x[0], y[0])))
                {
                    b.push(new Pair(key, TypeExpression.fromJellyType(value.getJellyType(), mgr)));
                }
                return new RecordTypeExpression(b);
            },

            array(inner: JellyType): TypeExpression
            {
                return new ListTypeExpression(TypeExpression.fromJellyType(inner, mgr));
            },

            function(_argType: readonly JellyType[], _resultType: JellyType): TypeExpression
            {
                throw new UnimplementedException();
            },

            ident(name: string): TypeExpression
            {
                return InvalidIdentTypeExpression.identOrUnfinished(name);
            },
        };
        return original.apply(visitor);
    }

    public abstract save(saveDestination: Expression.SaveDestination, renames: TableAndColumnRenames): string;

    public abstract toDataType(typeManager: TypeManager): DataType | null;

    public abstract toJellyType(typeManager: TypeManager, jellyRecorder: TypeExpression.JellyRecorder): JellyType;

    // PORT-NOTE: Java wraps the UserExceptions and InternalExceptions thrown inside the parse
    // tree visitor in unchecked exceptions, and unwraps them afterwards; here they just propagate.
    public static parseTypeExpression(src: string): TypeExpression
    {
        return Utility.parseAsOne(src, s => new FormatLexer(s), t => new FormatParser(t), p => p.completeTypeExpression()).accept(new class extends FormatParserVisitor<TypeExpression>
        {
            public override visitTypeExpressionTerminal = (ctx: TypeExpressionTerminalContext): TypeExpression =>
            {
                if (ctx.INCOMPLETE() !== null)
                {
                    return new IdentTypeExpression(ctx.STRING()!.getText());
                }
                else if (ctx.UNIT() !== null)
                {
                    const withCurly = ctx.UNIT()!.getText();
                    return new UnitLiteralTypeExpression(UnitExpression.load(withCurly.substring(1, withCurly.length - 1)));
                }
                else if (ctx.number() !== null)
                {
                    const unit = ctx.number()!.UNIT();
                    if (unit !== null)
                    {
                        const withCurly = unit.getText();
                        return new NumberTypeExpression(UnitExpression.load(withCurly.substring(1, withCurly.length - 1)));
                    }
                    else
                        return new NumberTypeExpression(null);
                }
                else if (ctx.BOOLEAN() !== null)
                {
                    return new TypePrimitiveLiteral(DataType.BOOLEAN);
                }
                else if (ctx.TEXT() !== null)
                {
                    return new TypePrimitiveLiteral(DataType.TEXT);
                }
                else if (ctx.ident() !== null)
                {
                    return new IdentTypeExpression(IdentifierUtility.fromParsed(ctx.ident()!));
                }
                else if (ctx.date() !== null)
                {
                    const d = ctx.date()!;
                    const DateTimeType = DateTimeInfo.DateTimeType;
                    if (d.YEARMONTHDAY() !== null)
                        return new TypePrimitiveLiteral(DataType.date(new DateTimeInfo(DateTimeType.YEARMONTHDAY)));
                    else if (d.YEARMONTH() !== null)
                        return new TypePrimitiveLiteral(DataType.date(new DateTimeInfo(DateTimeType.YEARMONTH)));
                    else if (d.DATETIME() !== null)
                        return new TypePrimitiveLiteral(DataType.date(new DateTimeInfo(DateTimeType.DATETIME)));
                    else if (d.DATETIMEZONED() !== null)
                        return new TypePrimitiveLiteral(DataType.date(new DateTimeInfo(DateTimeType.DATETIMEZONED)));
                    else if (d.TIMEOFDAY() !== null)
                        return new TypePrimitiveLiteral(DataType.date(new DateTimeInfo(DateTimeType.TIMEOFDAY)));
                }

                throw new UserException("Cannot parse: " + ctx.getText() + " unknown case");
            };

            public override visitArrayTypeExpression = (ctx: ArrayTypeExpressionContext): TypeExpression =>
            {
                return new ListTypeExpression(this.visit(ctx.typeExpression())!);
            };

            public override visitRecordTypeExpression = (ctx: RecordTypeExpressionContext): TypeExpression =>
            {
                const members: Pair<ExpressionIdentifier, TypeExpression>[] = [];

                for (let i = 0; i < ctx.fieldName().length; i++)
                {
                    const fieldName = IdentifierUtility.asExpressionIdentifier(ctx.fieldName(i)!.getText());
                    if (fieldName !== null)
                        members.push(new Pair(fieldName, this.visitTypeExpressionCtx(ctx.typeExpression(i)!)));
                }

                return new RecordTypeExpression(members);
            };

            public override visitInvalidOpsTypeExpression = (_ctx: InvalidOpsTypeExpressionContext): TypeExpression =>
            {
                return new InvalidOpTypeExpression([]/*Utility.mapListI(ctx.typeExpression(), t -> visitTypeExpression(t)),
                    Utility.mapListI(ctx.STRING(), s -> s.getText())
                */);
            };

            public override visitApplyTypeExpression = (ctx: ApplyTypeExpressionContext): TypeExpression =>
            {
                const typeName = IdentifierUtility.fromParsed(ctx.ident());

                const args: Either<UnitExpression, TypeExpression>[] = [];
                for (const applyArgumentExpressionContext of ctx.applyArgumentExpression())
                {
                    args.push(Either.right(this.visitApplyArgumentExpression!(applyArgumentExpressionContext)));
                }
                return new TypeApplyExpression(typeName, args);
            };

            public override visitApplyArgumentExpression = (ctx: ApplyArgumentExpressionContext): TypeExpression =>
            {
                const typeExpression = ctx.typeExpression();
                const recordTypeExpression = ctx.recordTypeExpression();
                if (typeExpression !== null)
                    return this.visitTypeExpressionCtx(typeExpression);
                else if (recordTypeExpression !== null)
                    return this.visitRecordTypeExpression!(recordTypeExpression);
                throw new InternalException("Neither typeExpression not recordTypeExpression in argument");
            };

            // Java: visitTypeExpression, which is not overridden, so visits the children
            private visitTypeExpressionCtx(ctx: TypeExpressionContext): TypeExpression
            {
                return this.visitChildren(ctx);
            }

            public override visitChildren(node: ParseTree): TypeExpression
            {
                let result: TypeExpression | null = this.defaultResult();
                const n = node.getChildCount();

                for (let i = 0; i < n && this.shouldVisitNextChild(node, result); ++i)
                {
                    const c = node.getChild(i)!;
                    const childResult = c.accept(this);
                    if (childResult === null)
                        break;
                    result = this.aggregateResult(result, childResult);
                }
                if (result === null)
                    throw new InternalException("No parseTypeExpression rules matched for " + node.getText());
                else
                    return result;
            }
        }())!;
    }

    public abstract isEmpty(): boolean;

    // Force sub-expressions to implement equals and hashCode:
    public abstract equals(o: unknown): boolean;
    public abstract hashCode(): number;

    // If this can be an ident key in a record type, return the ident:
    public abstract asIdent(): ExpressionIdentifier | null;

    public abstract toStyledString(): StyledString;

    public abstract replaceSubExpression(toReplace: TypeExpression, replaceWith: TypeExpression): TypeExpression;

    // Useful for debugging:
    public toString(): string
    {
        return this.save(Expression.SaveDestination.TO_STRING, TableAndColumnRenames.EMPTY);
    }
}

export namespace TypeExpression
{
    export interface JellyRecorder
    {
        record(jellyType: JellyType, source: TypeExpression): JellyType;
    }

    export class UnJellyableTypeExpression extends UserException
    {
        private readonly source: Either<UnitExpression, TypeExpression>; // For error location
        private readonly fixes: readonly QuickFix<UnitExpression>[];

        // Java: UnJellyableTypeExpression(String message, TypeExpression source) and
        // UnJellyableTypeExpression(StyledString message, UnitExpression source, ImmutableList<QuickFix<UnitExpression>> fixes)
        public constructor(message: string, source: TypeExpression);
        public constructor(message: StyledString, source: UnitExpression, fixes: readonly QuickFix<UnitExpression>[]);
        public constructor(message: string | StyledString, source: TypeExpression | UnitExpression, fixes?: readonly QuickFix<UnitExpression>[])
        {
            super(message);
            if (source instanceof UnitExpression)
            {
                this.source = Either.left(source);
                this.fixes = fixes!;
            }
            else
            {
                this.source = Either.right(source);
                this.fixes = [];
            }
        }

        public getSource(): Either<UnitExpression, TypeExpression>
        {
            return this.source;
        }

        public getFixes(): readonly QuickFix<UnitExpression>[]
        {
            return this.fixes;
        }
    }
}
