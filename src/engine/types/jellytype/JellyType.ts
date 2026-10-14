// Port of xyz.columnal.jellytype.JellyType (types module).
// Import JellyType and its subclasses from JellyTypes.ts (which see).
// The nested class UnknownTypeException and the visitor interfaces are top-level exports.
import type { ExpressionIdentifier } from "../../anns/Annotations.js";
import { HashMap } from "../../java/HashMap.js";
import { FormatLexer } from "../../parsers/generated/FormatLexer.js";
import { BracketedTypeContext, FormatParser, type NumberContext, type TagRefParamContext, TypeContext, type UnbracketedTypeContext } from "../../parsers/generated/FormatParser.js";
import { Either } from "../../utility-adt/utility/adt/Either.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { UserException } from "../../utility-error/error/UserException.js";
import { IdentifierUtility } from "../../utility/utility/IdentifierUtility.js";
import { Utility } from "../../utility/utility/Utility.js";
import type { DataType, TagType } from "../data/datatype/DataType.js";
import { DateTimeInfo } from "../data/datatype/DateTimeInfo.js";
import type { NumberInfo } from "../data/datatype/NumberInfo.js";
import { TypeId } from "../data/datatype/TypeId.js";
import type { TypeManager } from "../data/datatype/TypeManager.js";
import { Unit } from "../data/unit/Unit.js";
import type { OutputBuilder } from "../loadsave/OutputBuilder.js";
import type { MutVar, TypeExp } from "../typeExp/TypeExps.js";
import type { MutUnitVar } from "../typeExp/units/MutUnitVar.js";
import { JellyTypeApply, JellyTypeArray, JellyTypeFunction, JellyTypeIdent, JellyTypeNumberWithUnit, JellyTypePrimitive, JellyTypeRecord } from "./JellyTypes.js";
import { JellyUnit } from "./JellyUnit.js";

/**
 * There are three different representations of types:
 *   - DataType, which is a concrete type.  No type variables, no ambiguity, everything is a specific type.
 *     Immutable.  Can always be converted into TypeExp.  There's not a need to convert it to JellyType.
 *
 *   - TypeExp, which is used during type checking.  No named type variables, though there are mutable
 *     type variables which can be unified during the process.  Not immutable, and regenerated fresh
 *     every time we need to do a round of type checking.  Once type-checking is complete, it can be
 *     converted into a DataType (with an error if there remains problematic ambiguity).  There's no
 *     need to turn it into a JellyType.
 *
 *   - JellyType, named for being not a concrete type.  Mirrors DataType in structure, but can contain
 *     named type variables and unit variables.  Can produce a DataType given substitution for the named
 *     variables, ditto for TypeExp.
 */
export abstract class JellyType
{
    // package-visible constructor
    protected constructor()
    {
    }

    public static text(): JellyType
    {
        return JellyTypePrimitive.text();
    }

    public static number(unit: JellyUnit): JellyType
    {
        return new JellyTypeNumberWithUnit(unit);
    }

    public abstract makeTypeExp(typeVariables: ReadonlyMap<string, Either<MutUnitVar, MutVar>>): TypeExp;

    public abstract makeDataType(typeVariables: ReadonlyMap<string, Either<Unit, DataType>>, mgr: TypeManager): DataType;

    //public static class TypeQuickFix {}

    public abstract save(output: OutputBuilder): void;

    public abstract equals(o: unknown): boolean;

    public abstract hashCode(): number;

    // For every tagged type use anywhere within this type, call back the given function with the name.
    public abstract forNestedTagged(nestedTagged: (typeId: TypeId) => void): void;

    public static typeVariable(name: ExpressionIdentifier): JellyType
    {
        return new JellyTypeIdent(name);
    }

    public static record(members: ReadonlyMap<ExpressionIdentifier, JellyTypeRecord.Field>): JellyType
    {
        return new JellyTypeRecord(members, true);
    }

    public static tagged(name: TypeId, params: readonly Either<JellyUnit, JellyType>[]): JellyType
    {
        if (params.length === 0)
            return new JellyTypeIdent(name.getRaw());
        else
            return new JellyTypeApply(name, params);
    }

    public static list(inner: JellyType): JellyType
    {
        return new JellyTypeArray(inner);
    }

    // Java has public overloads for TypeContext and BracketedTypeContext, and private ones for
    // UnbracketedTypeContext, TagRefParamContext and NumberContext (here loadUnbracketed etc).
    public static load(ctx: TypeContext | BracketedTypeContext, mgr: TypeManager): JellyType
    {
        if (ctx instanceof TypeContext)
        {
            const typeContext = ctx;
            const unbracketedType = typeContext.unbracketedType();
            const bracketedType = typeContext.bracketedType();
            if (unbracketedType !== null)
                return JellyType.loadUnbracketed(unbracketedType, mgr);
            else if (bracketedType !== null)
                return JellyType.load(bracketedType, mgr);
            else
                throw new InternalException("Unrecognised case: " + typeContext.toString());
        }
        const type = ctx.type();
        const record = ctx.record();
        if (type !== null)
            return JellyType.load(type, mgr);
        else if (record !== null)
        {
            // PORT-NOTE: a Java HashMap, copied to an ImmutableMap, so the record's fields are in
            // Java's HashMap order (which is observable, e.g. in the field order of record types)
            const fields = HashMap.javaOrder<ExpressionIdentifier, JellyTypeRecord.Field>();
            for (let i = 0; i < record.columnName().length; i++)
            {
                const fieldName = IdentifierUtility.fromParsed(record.columnName(i)!);
                const type = JellyType.load(record.type_(i)!, mgr);
                const existed = fields.has(fieldName);
                fields.set(fieldName, new JellyTypeRecord.Field(type, true));
                if (existed)
                    throw new UserException("Duplicated field: \"" + fieldName + "\"");
            }
            return new JellyTypeRecord(new Map(fields), record.RECORD_MORE() === null);
        }
        throw new InternalException("Unrecognised case: " + ctx.toString());
    }

    private static loadUnbracketed(ctx: UnbracketedTypeContext, mgr: TypeManager): JellyType
    {
        const number = ctx.number();
        const date = ctx.date();
        const applyRef = ctx.applyRef();
        const array = ctx.array();
        const ident = ctx.ident();
        const functionType = ctx.functionType();
        if (ctx.BOOLEAN() !== null)
            return JellyTypePrimitive.bool();
        else if (number !== null)
            return JellyType.loadNumber(number, mgr);
        else if (ctx.TEXT() !== null)
            return JellyTypePrimitive.text();
        else if (date !== null)
        {
            if (date.DATETIME() !== null)
                return JellyTypePrimitive.date(new DateTimeInfo(DateTimeInfo.DateTimeType.DATETIME));
            else if (date.YEARMONTHDAY() !== null)
                return JellyTypePrimitive.date(new DateTimeInfo(DateTimeInfo.DateTimeType.YEARMONTHDAY));
            else if (date.TIMEOFDAY() !== null)
                return JellyTypePrimitive.date(new DateTimeInfo(DateTimeInfo.DateTimeType.TIMEOFDAY));
            if (date.YEARMONTH() !== null)
                return JellyTypePrimitive.date(new DateTimeInfo(DateTimeInfo.DateTimeType.YEARMONTH));
            if (date.DATETIMEZONED() !== null)
                return JellyTypePrimitive.date(new DateTimeInfo(DateTimeInfo.DateTimeType.DATETIMEZONED));
        }
        else if (applyRef !== null)
        {
            const typeId = new TypeId(IdentifierUtility.fromParsed(applyRef.ident()));
            return new JellyTypeApply(typeId, Utility.mapListExI(applyRef.tagRefParam(), param => JellyType.loadTagRefParam(param, mgr)));
        }
        else if (array !== null)
        {
            return new JellyTypeArray(JellyType.load(array.type()!, mgr));
        }
        else if (ident !== null)
        {
            // TODO is it right that @typevar comes to same place as plain ident?
            const name = IdentifierUtility.fromParsed(ident);
            return new JellyTypeIdent(name);
        }
        else if (functionType !== null)
            return new JellyTypeFunction(Utility.mapListExI(functionType.functionArgs().type_(), t => JellyType.load(t, mgr)), JellyType.load(functionType.type(), mgr));
        throw new InternalException("Unrecognised case: " + ctx.getText());
    }

    private static loadTagRefParam(param: TagRefParamContext, mgr: TypeManager): Either<JellyUnit, JellyType>
    {
        const bracketedType = param.bracketedType();
        const unit = param.UNIT();
        if (bracketedType !== null)
            return Either.right(JellyType.load(bracketedType, mgr));
        else if (unit !== null)
            // Strip curly brackets:
            return Either.left(JellyUnit.load(unit.getText().substring(1, unit.getText().length - 1), mgr.getUnitManager()));
        else if (param.UNITVAR() !== null)
            return Either.left(JellyUnit.unitVariable(param.ident()!.getText()));
        throw new InternalException("Unrecognised case: " + param.toString());
    }

    private static loadNumber(number: NumberContext, mgr: TypeManager): JellyType
    {
        const unit = number.UNIT();
        if (unit === null)
            return new JellyTypeNumberWithUnit(JellyUnit.fromConcrete(Unit.SCALAR));
        else
        {
            const withCurly = unit.getText();
            return new JellyTypeNumberWithUnit(JellyUnit.load(withCurly.substring(1, withCurly.length - 1), mgr.getUnitManager()));
        }
    }

    public static parse(functionType: string, mgr: TypeManager): JellyType
    {
        return JellyType.load(Utility.parseAsOne<TypeContext, FormatParser>(functionType, s => new FormatLexer(s), t => new FormatParser(t), p => p.completeType().type()), mgr);
    }

    public abstract apply<R>(visitor: JellyTypeVisitorEx<R>): R;

    public static fromConcrete(t: DataType): JellyType
    {
        return t.apply<JellyType>({
            number(numberInfo: NumberInfo): JellyType
            {
                return new JellyTypeNumberWithUnit(JellyUnit.fromConcrete(numberInfo.getUnit()));
            },

            text(): JellyType
            {
                return JellyTypePrimitive.text();
            },

            date(dateTimeInfo: DateTimeInfo): JellyType
            {
                return JellyTypePrimitive.date(dateTimeInfo);
            },

            bool(): JellyType
            {
                return JellyTypePrimitive.bool();
            },

            tagged(typeName: TypeId, typeVars: readonly Either<Unit, DataType>[], _tags: readonly TagType<DataType>[]): JellyType
            {
                if (typeVars.length === 0)
                    return new JellyTypeIdent(typeName.getRaw());
                return new JellyTypeApply(typeName, Utility.mapListInt(typeVars, e =>
                    e.mapBothInt<JellyUnit, JellyType>(u => JellyUnit.fromConcrete(u), t => JellyType.fromConcrete(t))
                ));
            },

            record(fields: ReadonlyMap<ExpressionIdentifier, DataType>): JellyType
            {
                return new JellyTypeRecord(new Map(Utility.mapValuesInt(fields, t => new JellyTypeRecord.Field(JellyType.fromConcrete(t), false))), true);
            },

            array(inner: DataType): JellyType
            {
                return new JellyTypeArray(JellyType.fromConcrete(inner));
            },

            function(argType: readonly DataType[], resultType: DataType): JellyType
            {
                return new JellyTypeFunction(Utility.mapListInt(argType, a => JellyType.fromConcrete(a)), JellyType.fromConcrete(resultType));
            },
        });
    }
}

export class UnknownTypeException extends UserException
{
    private readonly suggestedFixes: readonly JellyType[];
    private readonly replacementTarget: JellyType;

    public constructor(message: string, replacementTarget: JellyType, suggestedFixes: readonly JellyType[])
    {
        super(message);
        this.replacementTarget = replacementTarget;
        this.suggestedFixes = suggestedFixes;
    }

    public getSuggestedFixes(): readonly JellyType[]
    {
        return this.suggestedFixes;
    }

    public getReplacementTarget(): JellyType
    {
        return this.replacementTarget;
    }
}

/** Java: JellyTypeVisitorEx<R, E extends Throwable> */
export interface JellyTypeVisitorEx<R>
{
    number(unit: JellyUnit): R;
    text(): R;
    date(dateTimeInfo: DateTimeInfo): R;
    bool(): R;
    applyTagged(typeName: TypeId, typeParams: readonly Either<JellyUnit, JellyType>[]): R;
    record(fields: ReadonlyMap<ExpressionIdentifier, JellyTypeRecord.Field>, complete: boolean): R;
    // If null, array is empty and thus of unknown type
    array(inner: JellyType): R;
    function(argTypes: readonly JellyType[], resultType: JellyType): R;
    ident(name: string): R;
}

/** Java: JellyTypeVisitor<R> extends JellyTypeVisitorEx<R, UserException> */
export type JellyTypeVisitor<R> = JellyTypeVisitorEx<R>;

