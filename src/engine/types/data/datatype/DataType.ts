// Port of xyz.columnal.data.datatype.DataType (types module).
//
// The nested classes are ported as follows: DateTimeInfo is in DateTimeInfo.ts; TagType and
// the visitor interfaces and classes are top-level exports here; the private subclasses are
// module-private classes.
import { ParseCancellationException } from "antlr4ng";
import type { ExpressionIdentifier, Localized } from "../../../anns/Annotations.js";
import { HashMap } from "../../../java/HashMap.js";
import { javaEquals, javaHashCode, javaObjectsHash, javaStringCompare, javaStringHashCode } from "../../../java/JavaObject.js";
import { javaTrim } from "../../../java/JavaString.js";
import { isTemporalAccessor, type TemporalAccessor } from "../../../java/time/TemporalAccessor.js";
import { Decimal } from "../../../java/JavaBigDecimal.js";
import { vocabularyOf } from "../../../parsers/grammar/Vocabularies.js";
import { DataLexer2 } from "../../../parsers/generated/DataLexer2.js";
import { DataParser } from "../../../parsers/generated/DataParser.js";
import { DataParser2 } from "../../../parsers/generated/DataParser2.js";
import { FormatLexer } from "../../../parsers/generated/FormatLexer.js";
import { Either } from "../../../utility-adt/utility/adt/Either.js";
import { InternalException } from "../../../utility-error/error/InternalException.js";
import { UserException } from "../../../utility-error/error/UserException.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import type { StyledShowable } from "../../../utility-error/styled/StyledShowable.js";
import { ParseException } from "../../../utility/error/parse/ParseException.js";
import { Log } from "../../../utility/log/Log.js";
import { IdentifierUtility } from "../../../utility/utility/IdentifierUtility.js";
import { TaggedValue } from "../../../utility/utility/TaggedValue.js";
import { UnitType } from "../../../utility/utility/UnitType.js";
import { javaClassName, ListEx, ListExList, Record, RecordMap, Utility } from "../../../utility/utility/Utility.js";
import type { Value } from "../../../utility/utility/Value.js";
import type { OutputBuilder } from "../../loadsave/OutputBuilder.js";
import { Unit } from "../unit/Unit.js";
import { DataTypeUtility } from "./DataTypeUtility.js";
import { DataTypeValue, GetValue } from "./DataTypeValue.js";
import { DateTimeInfo } from "./DateTimeInfo.js";
import { NumberInfo } from "./NumberInfo.js";
import type { TypeId } from "./TypeId.js";

/**
 * A data type can be the following:
 *
 *  - A built-in/primitive type:
 *    - A number.  This has a small bit of dynamic typing: it may be
 *      integers or decimals, but this is a performance optimisation
 *      not a user-visible difference.
 *    - A string.
 *    - A date.
 *    - A boolean
 *  - A composite type:
 *    - A set of 2+ tags.  Each tag may have 0 or 1 arguments (think Haskell's
 *      ADTs, but where you either have a tuple as an arg or nothing).
 *    - A record (named fields) of 2+ types.
 *    - An array (i.e. variable-length list) of items of a single type.
 *
 *  Written in pseudo-Haskell:
 *  data Type = N Number | T String | D Date | B Boolean
 *            | Tags [(TagName, Maybe Type)]
 *            | Record [(FieldName, Type)]
 *            | Array Type
 */
export abstract class DataType implements StyledShowable
{
    public fromCollapsed(get: GetValue<Value>): DataTypeValue
    {
        // Java: castTo(Class<T>), which checks each value is an instance of the class:
        function castTo<T extends Value>(cls: ValueClass<T>): GetValue<T>
        {
            return new class extends GetValue<T>
            {
                public override getWithProgress(i: number, prog: ((progress: number) => void) | null): T
                {
                    const value = get.getWithProgress(i, prog);
                    if (!cls.is(value))
                        throw new InternalException("Type inconsistency: should be " + cls.javaName + " but is " + javaClassName(value));
                    return value;
                }

                public override set(index: number, value: Either<string, T>): void
                {
                    get.set(index, value.map<Value>(v => v));
                }
            }();
        }

        return this.apply<DataTypeValue>({
            number(displayInfo: NumberInfo): DataTypeValue
            {
                return DataTypeValue.number(displayInfo, castTo(ValueClass.NUMBER));
            },

            text(): DataTypeValue
            {
                return DataTypeValue.text(castTo(ValueClass.STRING));
            },

            date(dateTimeInfo: DateTimeInfo): DataTypeValue
            {
                return DataTypeValue.date(dateTimeInfo, castTo(ValueClass.TEMPORAL));
            },

            bool(): DataTypeValue
            {
                return DataTypeValue.bool(castTo(ValueClass.BOOLEAN));
            },

            tagged(typeName: TypeId, typeVars: readonly Either<Unit, DataType>[], tags: readonly TagType<DataType>[]): DataTypeValue
            {
                const getTaggedValue = castTo(ValueClass.TAGGED);
                return DataTypeValue.tagged(typeName, typeVars, tags, getTaggedValue);
            },

            record(fields: ReadonlyMap<ExpressionIdentifier, DataType>): DataTypeValue
            {
                return DataTypeValue.record(fields, castTo(ValueClass.RECORD));
            },

            array(inner: DataType): DataTypeValue
            {
                const getList = castTo(ValueClass.LIST);
                return DataTypeValue.array(inner, getList);
            },
        });
    }

    public static function(argType: readonly DataType[], resultType: DataType): DataType
    {
        return new FunctionDataType(argType, resultType);
    }

    // Java: package-visible constructor
    protected constructor()
    {
    }

    // Java: static final fields; getters here because the subclasses are defined after DataType.
    public static get NUMBER(): DataType
    {
        return NUMBER_INSTANCE;
    }

    public static get BOOLEAN(): DataType
    {
        return BOOLEAN_INSTANCE;
    }

    public static get TEXT(): DataType
    {
        return TEXT_INSTANCE;
    }

    public static array(inner: DataType): DataType
    {
        return new ListDataType(inner);
    }

    public static record(fields: Iterable<readonly [ExpressionIdentifier, DataType]>): DataType
    {
        return new RecordDataType(fields);
    }

    public static date(dateTimeInfo: DateTimeInfo): DataType
    {
        return new TemporalDataType(dateTimeInfo);
    }

    public abstract apply<R>(visitor: DataTypeVisitorEx<R>): R;

    public toDisplay(drillIntoTagged: boolean): Localized
    {
        return this.apply<string>({
            number(displayInfo: NumberInfo): string
            {
                const unit = displayInfo.getUnit().forDisplay();
                return "Number" + (unit === "" ? "" : "{" + unit + "}");
            },

            text(): string
            {
                return "Text";
            },

            tagged(typeName: TypeId, typeVars: readonly Either<Unit, DataType>[], tags: readonly TagType<DataType>[]): string
            {
                let typeStr: Localized = typeName.getRaw();
                if (typeVars.length !== 0)
                    typeStr += typeVars.map(t => "(" + t.either(u => "{" + u.toString() + "}", ty => ty.toString()) + ")").join("");
                if (drillIntoTagged)
                {
                    typeStr += " <";
                    for (let i = 0; i < tags.length; i++)
                    {
                        if (i > 0)
                            typeStr += " | ";
                        const tag = tags[i]!;
                        typeStr += tag.getName();
                        const inner = tag.getInner();
                        if (inner !== null)
                        {
                            typeStr += ":" + inner.toDisplay(true);
                        }
                    }
                    typeStr += ">";
                }
                return typeStr;
            },

            record(fields: ReadonlyMap<ExpressionIdentifier, DataType>): string
            {
                let s = "(";
                let first = true;
                for (const [key, value] of [...fields].sort((a, b) => javaStringCompare(a[0], b[0])))
                {
                    if (!first)
                        s += ", ";
                    first = false;
                    s += key + ": ";
                    s += value.apply(this);
                }
                s += ")";
                return s;
            },

            array(inner: DataType | null): string
            {
                if (inner === null)
                    return "[]";
                else
                    return "[" + inner.apply(this) + "]";
            },

            date(dateTimeInfo: DateTimeInfo): string
            {
                switch (dateTimeInfo.getType())
                {
                    case DateTimeInfo.DateTimeType.YEARMONTHDAY:
                        return "Date";
                    case DateTimeInfo.DateTimeType.YEARMONTH:
                        return "DateYM";
                    case DateTimeInfo.DateTimeType.TIMEOFDAY:
                        return "Time";
                    //case TIMEOFDAYZONED:
                        //return "TimeZoned";
                    case DateTimeInfo.DateTimeType.DATETIME:
                        return "DateTime";
                    case DateTimeInfo.DateTimeType.DATETIMEZONED:
                        return "DateTimeZoned";
                }
                throw new InternalException("Unknown date type: " + String(dateTimeInfo.getType()));
            },

            bool(): string
            {
                return "Boolean";
            },

            function(argTypes: readonly DataType[], resultType: DataType): string
            {
                return "(" + Utility.mapListExI(argTypes, a => a.toDisplay(drillIntoTagged)).join(", ") + ") -> " + resultType.toDisplay(drillIntoTagged);
            },
        });
    }

    public toString(): string
    {
        try
        {
            return this.toDisplay(true);
        }
        catch (e)
        {
            if (!(e instanceof UserException || e instanceof InternalException))
                throw e;
            Log.log(e);
            return "Error: " + e.getLocalizedMessage();
        }
    }

    public toStyledString(): StyledString
    {
        try
        {
            return StyledString.s(this.toDisplay(false));
        }
        catch (e)
        {
            if (!(e instanceof UserException || e instanceof InternalException))
                throw e;
            Log.log(e);
            return StyledString.s("Error showing type: " + e.getLocalizedMessage());
        }
    }

    // Java: package-visible
    public static tagged(name: TypeId, typeVariableSubstitutes: readonly Either<Unit, DataType>[], tagTypes: readonly TagType<DataType>[]): DataType
    {
        return new TaggedDataType(name, typeVariableSubstitutes, tagTypes);
    }

    public static number(numberInfo: NumberInfo): DataType
    {
        return new NumberDataType(numberInfo);
    }

    public abstract equals(o: unknown): boolean;

    public abstract hashCode(): number;

    // Tries a parse and if it fails, returns null.  Should only be used for single-token parses,
    // or those where you stop trying after failure, because I'm not sure what happens if you're partway
    // through a partial parse and it cancels.
    private static tryParse<T>(parseAction: () => T | null): T | null
    {
        try
        {
            return parseAction();
        }
        catch (e)
        {
            if (!(e instanceof ParseCancellationException))
                throw e;
            return null;
        }
    }

    // Java has overloads for DataParser and DataParser2 (here, any parser), and takes the parser
    // and a function to apply to it; here the function closes over the parser.
    // (Java: private, but also used by the nested DateTimeInfo class.)
    public static tryParseOrInvalid<DATA_OR_INVALID, T>(parseOrInvalid: () => DATA_OR_INVALID | null, getInvalid: (d: DATA_OR_INVALID) => { STRING(): { getText(): string } } | null, getValid: (d: DATA_OR_INVALID) => T | null): Either<string, T> | null
    {
        try
        {
            const dataOrInvalid = parseOrInvalid();
            if (dataOrInvalid !== null)
            {
                const invalidItemContext = getInvalid(dataOrInvalid);
                if (invalidItemContext !== null)
                    return Either.left(invalidItemContext.STRING().getText());
                const t = getValid(dataOrInvalid);
                if (t !== null)
                    return Either.right(t);
            }
            return null;
        }
        catch (e)
        {
            if (!(e instanceof ParseCancellationException))
                throw e;
            return null;
        }
    }

    // Java has overloads for DataParser and DataParser2
    public static loadArray(innerFinal: DataType, p: DataParser | DataParser2): Either<string, ListEx>
    {
        const openSquare = DataType.tryParseOrInvalid(() => p.openSquareOrInvalid(), o => o.invalidItem(), o => o.openSquare());
        if (openSquare === null)
            throw new UserException("Expected array but found: \"" + String(p.getCurrentToken()) + "\"");
        return openSquare.mapEx<ListEx>(_s => {
            const array: Value[] = [];
            let seenComma = true;
            while (DataType.tryParse(() => p.closeSquare()) === null)
            {
                if (!seenComma)
                {
                    throw new UserException("Expected comma but found " + String(p.getCurrentToken()));
                }
                array.push(DataType.loadSingleItem(innerFinal, p, false).getRight("Invalid nested disallowed"));
                seenComma = DataType.tryParse(() => p.comma()) !== null;
            }
            return new ListExList(array);
        });
    }

    // Java has overloads for DataParser and DataParser2
    public static loadRecord(fields: ReadonlyMap<ExpressionIdentifier, DataType>, p: DataParser | DataParser2, consumedRoundBrackets: boolean): Either<string, Record>
    {
        let openRound: Either<string, unknown> | null;
        if (consumedRoundBrackets)
            openRound = Either.right("");
        else
            openRound = DataType.tryParseOrInvalid(() => p.openRoundOrInvalid(), o => o.invalidItem(), o => o.openRound());
        if (openRound === null)
            throw new UserException("Expected record but found: \"" + String(p.getCurrentToken()) + "\"");
        return openRound.mapEx<Record>(_o => {
            // PORT-NOTE: a Java HashMap, whose order becomes the record's field order:
            const fieldValues = HashMap.javaOrder<ExpressionIdentifier, Value>();
            for (let i = 0; i < fields.size; i++)
            {
                const labelContext = p.label();
                const fieldName = IdentifierUtility.fromParsed(labelContext);
                if (fieldName === null)
                    throw new ParseException("Invalid field name: \"" + labelContext.getText() + "\"", p);
                const fieldType = fields.get(fieldName);
                if (fieldType === undefined)
                    throw new ParseException("Unrecognised field: \"" + fieldName + "\"", p);
                const loaded = DataType.loadSingleItem(fieldType, p, false).getRight("Invalid nested invalid");
                const previous = fieldValues.get(fieldName);
                fieldValues.set(fieldName, loaded);
                if (previous !== undefined)
                    throw new ParseException("Duplicate field: \"" + fieldName + "\"", p);
                if (i < fields.size - 1)
                {
                    if (DataType.tryParse(() => p.comma()) === null)
                        throw new ParseException("comma", p);
                }
            }
            // Don't actually think this is possible given we check for duplicates and consume the right number, but for sanity:
            if (fieldValues.size !== fields.size || [...fields.keys()].some(k => !fieldValues.has(k)))
                throw new ParseException("Not all fields found or duplicate fields found", p);
            if (!consumedRoundBrackets)
            {
                if (DataType.tryParse(() => p.closeRound()) === null)
                    throw new UserException("Expected tuple end but found: " + String(p.getCurrentToken()));
            }
            return DataTypeUtility.value(new RecordMap(fieldValues));
        });
    }

    // Java has overloads for DataParser and DataParser2
    public static loadBool(p: DataParser | DataParser2): Either<string, boolean>
    {
        const boolContext = DataType.tryParseOrInvalid(() => p.boolOrInvalid(), b => b.invalidItem(), b => b.bool());
        if (boolContext === null)
            throw new UserException("Expected boolean value but found: \"" + String(p.getCurrentToken()) + "\"");
        return boolContext.map<boolean>(b => DataTypeUtility.value(javaTrim(b.getText()).toLowerCase() === "true"));
    }

    // Java has overloads for DataParser and DataParser2
    public static loadString(p: DataParser | DataParser2): Either<string, string>
    {
        const stringContext = DataType.tryParseOrInvalid(() => p.stringOrInvalid(), s => s.invalidItem(), s => s.string());
        if (stringContext === null)
            throw new ParseException("string", p);
        return stringContext.map<string>(string => DataTypeUtility.value(string.STRING().getText()));
    }

    // Java has overloads for DataParser and DataParser2
    public static loadNumber(p: DataParser | DataParser2): Either<string, Decimal>
    {
        const numberContext = DataType.tryParseOrInvalid(() => p.numberOrInvalid(), n => n.invalidItem(), n => n.number());
        if (numberContext === null)
            throw new UserException("Expected number value but found: \"" + String(p.getCurrentToken()) + "\"");
        return numberContext.mapEx<Decimal>(number => Utility.parseNumber(javaTrim(number.getText())));
    }

    // Java has overloads for DataParser and DataParser2, which differ when no tag matches:
    // the DataParser version throws, the DataParser2 version returns the unmatched name as a Left.
    public static loadTaggedValue(tags: readonly TagType<DataType>[], p: DataParser | DataParser2): Either<string, TaggedValue>
    {
        const tagContext = DataType.tryParseOrInvalid(() => p.tagOrInvalid(), t => t.invalidItem(), t => t.tag());
        if (tagContext === null)
            throw new ParseException("tagged value", p);
        return tagContext.flatMapEx<TaggedValue>(b => {
            const string = b.STRING();
            const constructor = string !== null ? string.getText() : b.UNQUOTED_IDENT()!.getText();
            for (let i = 0; i < tags.length; i++)
            {
                const tag = tags[i]!;
                if (tag.getName() === constructor)
                {
                    const innerType = tag.getInner();
                    if (innerType !== null)
                    {
                        if (DataType.tryParse(() => p.openRound()) === null)
                            throw new ParseException("Bracketed inner value for " + constructor, p);
                        const innerValue = DataType.loadSingleItem(innerType, p, true).getRight("Invalid nested invalid");
                        if (DataType.tryParse(() => p.closeRound()) === null)
                            throw new ParseException("Closing tagged value bracket for " + constructor, p);
                        return Either.right(new TaggedValue(i, innerValue, DataTypeUtility.fromTags(tags)));
                    }
                    return Either.right(new TaggedValue(i, null, DataTypeUtility.fromTags(tags)));
                }
            }
            if (p instanceof DataParser)
                throw new UserException("Could not find matching tag for: \"" + constructor + "\" in: " + tags.map(t => "\"" + t.getName() + "\"").join(", "));
            return Either.left(constructor);
        });
    }

    /**
     * Java has an instance method loadSingleItem(String content), and static
     * loadSingleItem(DataType, DataParser or DataParser2, boolean) methods.
     */
    public loadSingleItem(content: string): Either<string, Value>
    {
        try
        {
            return Utility.parseAsOne<Either<string, Value>, DataParser2>(content, s => new DataLexer2(s), t => new DataParser2(t), p => {
                const item = DataType.loadSingleItem(this, p, false);
                p.eof();
                return item;
            });
        }
        catch (e)
        {
            if (!(e instanceof UserException))
                throw e;
            return Either.left(content);
        }
    }

    public static loadSingleItem(type: DataType, p: DataParser | DataParser2, consumedRoundBrackets: boolean): Either<string, Value>
    {
        return type.apply<Either<string, Value>>({
            number(_displayInfo: NumberInfo): Either<string, Value>
            {
                return DataType.loadNumber(p).map<Value>(n => n);
            },

            text(): Either<string, Value>
            {
                return DataType.loadString(p).map<Value>(s => s);
            },

            date(dateTimeInfo: DateTimeInfo): Either<string, Value>
            {
                return dateTimeInfo.parse(p).map<Value>(t => t);
            },

            bool(): Either<string, Value>
            {
                return DataType.loadBool(p).map<Value>(b => b);
            },

            tagged(_typeName: TypeId, _typeVars: readonly Either<Unit, DataType>[], tags: readonly TagType<DataType>[]): Either<string, Value>
            {
                return DataType.loadTaggedValue(tags, p).map<Value>(t => t);
            },

            record(fields: ReadonlyMap<ExpressionIdentifier, DataType>): Either<string, Value>
            {
                return DataType.loadRecord(fields, p, consumedRoundBrackets).map<Value>(t => t);
            },

            array(inner: DataType | null): Either<string, Value>
            {
                if (inner === null)
                    throw new UserException("Cannot load column with value of type empty array");
                return DataType.loadArray(inner, p).map<Value>(l => l);
            },
        });
    }

    // save the declaration of this type
    // If topLevelDeclaration is false, save a reference (matters for tagged types)
    public save(b: OutputBuilder): OutputBuilder
    {
        const vocab = vocabularyOf(FormatLexer);
        this.apply<UnitType>({
            number(numberInfo: NumberInfo): UnitType
            {
                b.t(FormatLexer.NUMBER, vocab);
                if (!numberInfo.getUnit().equals(Unit.SCALAR))
                    b.unit(numberInfo.getUnit().toString());
                return UnitType.UNIT;
            },

            text(): UnitType
            {
                b.t(FormatLexer.TEXT, vocab);
                return UnitType.UNIT;
            },

            date(dateTimeInfo: DateTimeInfo): UnitType
            {
                switch (dateTimeInfo.getType())
                {
                    case DateTimeInfo.DateTimeType.YEARMONTHDAY:
                        b.t(FormatLexer.YEARMONTHDAY, vocab);
                        break;
                    case DateTimeInfo.DateTimeType.YEARMONTH:
                        b.t(FormatLexer.YEARMONTH, vocab);
                        break;
                    case DateTimeInfo.DateTimeType.TIMEOFDAY:
                        b.t(FormatLexer.TIMEOFDAY, vocab);
                        break;
                    //case TIMEOFDAYZONED:
                        //b.t(FormatLexer.TIMEOFDAYZONED, FormatLexer.VOCABULARY);
                        //break;
                    case DateTimeInfo.DateTimeType.DATETIME:
                        b.t(FormatLexer.DATETIME, vocab);
                        break;
                    case DateTimeInfo.DateTimeType.DATETIMEZONED:
                        b.t(FormatLexer.DATETIMEZONED, vocab);
                        break;
                }
                return UnitType.UNIT;
            },

            bool(): UnitType
            {
                b.t(FormatLexer.BOOLEAN, vocab);
                return UnitType.UNIT;
            },

            tagged(typeName: TypeId, typeVars: readonly Either<Unit, DataType>[], _tags: readonly TagType<DataType>[]): UnitType
            {
                if (typeVars.length === 0)
                {
                    b.raw(typeName.getRaw());
                }
                else
                {
                    b.t(FormatLexer.APPLY, vocab);
                    b.raw(" ");
                    b.raw(typeName.getRaw());
                    for (const typeVar of typeVars)
                    {
                        typeVar.eitherInt(u => b.unit(u.toString()), t => {
                            b.raw("(");
                            t.save(b);
                            return b.raw(")");
                        });
                    }
                }
                return UnitType.UNIT;
            },

            record(fields: ReadonlyMap<ExpressionIdentifier, DataType>): UnitType
            {
                b.t(FormatLexer.OPEN_BRACKET, vocab);
                let first = true;
                for (const [key, value] of [...fields].sort((x, y) => javaStringCompare(x[0], y[0])))
                {
                    if (!first)
                        b.raw(",");
                    first = false;
                    b.expId(key);
                    b.raw(":");
                    value.save(b);
                }
                b.t(FormatLexer.CLOSE_BRACKET, vocab);
                return UnitType.UNIT;
            },

            array(inner: DataType | null): UnitType
            {
                b.t(FormatLexer.OPEN_SQUARE, vocab);
                if (inner !== null)
                    inner.save(b);
                b.t(FormatLexer.CLOSE_SQUARE, vocab);
                return UnitType.UNIT;
            },
        });
        return b;
    }
}

/**
 * Java: DataTypeVisitorEx<R, E extends Throwable>, with a default function method that throws.
 * Here function is optional; DataType.apply throws if it is absent.
 */
export interface DataTypeVisitorEx<R>
{
    number(numberInfo: NumberInfo): R;
    text(): R;
    date(dateTimeInfo: DateTimeInfo): R;
    bool(): R;
    tagged(typeName: TypeId, typeVars: readonly Either<Unit, DataType>[], tags: readonly TagType<DataType>[]): R;
    record(fields: ReadonlyMap<ExpressionIdentifier, DataType>): R;
    array(inner: DataType): R;
    function?(argTypes: readonly DataType[], resultType: DataType): R;
}

/** Java: DataTypeVisitor<R> extends DataTypeVisitorEx<R, UserException> */
export type DataTypeVisitor<R> = DataTypeVisitorEx<R>;

export class SpecificDataTypeVisitor<R> implements DataTypeVisitorEx<R>
{
    public number(_displayInfo: NumberInfo): R
    {
        throw new InternalException("Unexpected number data type");
    }

    public text(): R
    {
        throw new InternalException("Unexpected text data type");
    }

    public tagged(_typeName: TypeId, _typeVars: readonly Either<Unit, DataType>[], _tags: readonly TagType<DataType>[]): R
    {
        throw new InternalException("Unexpected tagged data type");
    }

    public bool(): R
    {
        throw new InternalException("Unexpected boolean type");
    }

    public date(_dateTimeInfo: DateTimeInfo): R
    {
        throw new InternalException("Unexpected date type");
    }

    public record(_fields: ReadonlyMap<ExpressionIdentifier, DataType>): R
    {
        throw new InternalException("Unexpected record type");
    }

    public array(_inner: DataType): R
    {
        throw new InternalException("Unexpected array type");
    }
}

export class FlatDataTypeVisitor<T> implements DataTypeVisitorEx<T>
{
    private readonly def: T;

    public constructor(def: T)
    {
        this.def = def;
    }

    public number(_numberInfo: NumberInfo): T
    {
        return this.def;
    }

    public text(): T
    {
        return this.def;
    }

    public date(_dateTimeInfo: DateTimeInfo): T
    {
        return this.def;
    }

    public bool(): T
    {
        return this.def;
    }

    public tagged(_typeName: TypeId, _typeVars: readonly Either<Unit, DataType>[], _tags: readonly TagType<DataType>[]): T
    {
        return this.def;
    }

    public record(_fields: ReadonlyMap<ExpressionIdentifier, DataType>): T
    {
        return this.def;
    }

    public array(_inner: DataType): T
    {
        return this.def;
    }

    public function(_argTypes: readonly DataType[], _resultType: DataType): T
    {
        return this.def;
    }
}

export class TagType<T>
{
    private readonly name: ExpressionIdentifier;
    private readonly inner: T | null;

    public constructor(name: ExpressionIdentifier, inner: T | null)
    {
        this.name = name;
        this.inner = inner;
    }

    public getName(): ExpressionIdentifier
    {
        return this.name;
    }

    public getInner(): T | null
    {
        return this.inner;
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof TagType) || o.constructor !== this.constructor) return false;
        if (this.name !== o.name) return false;
        return this.inner !== null ? javaEquals(this.inner, o.inner) : o.inner === null;
    }

    public hashCode(): number
    {
        let result = javaStringHashCode(this.name);
        result = (Math.imul(31, result) + (this.inner !== null ? javaHashCode(this.inner) : 0)) | 0;
        return result;
    }

    public toString(): string
    {
        return this.name + (this.inner === null ? "" : ("\\" + String(this.inner)));
    }

    public map<U>(changeInner: (t: T) => U): TagType<U>
    {
        return new TagType<U>(this.name, this.inner === null ? null : changeInner(this.inner));
    }

    public mapInt<U>(changeInner: (t: T) => U): TagType<U>
    {
        return new TagType<U>(this.name, this.inner === null ? null : changeInner(this.inner));
    }
}

/**
 * Java's Class objects for the kinds of value (Number.class, String.class, ...), for the
 * runtime checks that Java does with Class.isAssignableFrom and Class.cast.
 */
export interface ValueClass<T extends Value>
{
    readonly javaName: string;
    is(v: Value): v is T;
}

export namespace ValueClass
{
    export const NUMBER: ValueClass<Decimal> = { javaName: "class java.lang.Number", is: (v): v is Decimal => Decimal.isDecimal(v) };
    export const STRING: ValueClass<string> = { javaName: "class java.lang.String", is: (v): v is string => typeof v === "string" };
    export const BOOLEAN: ValueClass<boolean> = { javaName: "class java.lang.Boolean", is: (v): v is boolean => typeof v === "boolean" };
    export const TEMPORAL: ValueClass<TemporalAccessor> = { javaName: "interface java.time.temporal.TemporalAccessor", is: (v): v is TemporalAccessor => isTemporalAccessor(v) };
    export const TAGGED: ValueClass<TaggedValue> = { javaName: "class xyz.columnal.utility.TaggedValue", is: (v): v is TaggedValue => v instanceof TaggedValue };
    export const RECORD: ValueClass<Record> = { javaName: "class xyz.columnal.utility.Utility$Record", is: (v): v is Record => v instanceof Record };
    export const LIST: ValueClass<ListEx> = { javaName: "class xyz.columnal.utility.Utility$ListEx", is: (v): v is ListEx => v instanceof ListEx };

    /** Java: castTo.cast(value), which throws a ClassCastException if the value is not of the class */
    export function cast<T extends Value>(cls: ValueClass<T>, v: Value): T
    {
        if (!cls.is(v))
            throw new TypeError("ClassCastException: Cannot cast " + javaClassName(v).replace(/^class /, "") + " to " + cls.javaName.replace(/^(class|interface) /, ""));
        return v;
    }
}

class NumberDataType extends DataType
{
    private readonly numberInfo: NumberInfo;

    public constructor(numberInfo: NumberInfo)
    {
        super();
        this.numberInfo = numberInfo;
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof NumberDataType)) return false;
        return this.numberInfo.equals(o.numberInfo);
    }

    public override hashCode(): number
    {
        return javaObjectsHash(this.numberInfo);
    }

    public override apply<R>(visitor: DataTypeVisitorEx<R>): R
    {
        return visitor.number(this.numberInfo);
    }
}

class TextDataType extends DataType
{
    public constructor()
    {
        super();
    }

    public override equals(o: unknown): boolean
    {
        return o instanceof TextDataType;
    }

    public override hashCode(): number
    {
        return 1;
    }

    public override apply<R>(visitor: DataTypeVisitorEx<R>): R
    {
        return visitor.text();
    }
}

class BooleanDataType extends DataType
{
    public constructor()
    {
        super();
    }

    public override equals(o: unknown): boolean
    {
        return o instanceof BooleanDataType;
    }

    public override hashCode(): number
    {
        return 1;
    }

    public override apply<R>(visitor: DataTypeVisitorEx<R>): R
    {
        return visitor.bool();
    }
}

class TemporalDataType extends DataType
{
    private readonly dateTimeInfo: DateTimeInfo;

    public constructor(dateTimeInfo: DateTimeInfo)
    {
        super();
        this.dateTimeInfo = dateTimeInfo;
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof TemporalDataType)) return false;
        return this.dateTimeInfo.equals(o.dateTimeInfo);
    }

    public override hashCode(): number
    {
        return javaObjectsHash(this.dateTimeInfo);
    }

    public override apply<R>(visitor: DataTypeVisitorEx<R>): R
    {
        return visitor.date(this.dateTimeInfo);
    }
}

class TaggedDataType extends DataType
{
    private readonly name: TypeId;
    private readonly typeVariableSubstitutions: readonly Either<Unit, DataType>[];
    private readonly tagTypes: readonly TagType<DataType>[];

    public constructor(name: TypeId, typeVariableSubstitutions: readonly Either<Unit, DataType>[], tagTypes: readonly TagType<DataType>[])
    {
        super();
        this.name = name;
        this.typeVariableSubstitutions = typeVariableSubstitutions;
        this.tagTypes = tagTypes;
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof TaggedDataType)) return false;
        return this.name.equals(o.name) &&
            javaEquals(this.typeVariableSubstitutions, o.typeVariableSubstitutions) &&
            javaEquals(this.tagTypes, o.tagTypes);
    }

    public override hashCode(): number
    {
        return javaObjectsHash(this.name, this.typeVariableSubstitutions, this.tagTypes);
    }

    public override apply<R>(visitor: DataTypeVisitorEx<R>): R
    {
        return visitor.tagged(this.name, this.typeVariableSubstitutions, this.tagTypes);
    }
}

class RecordDataType extends DataType
{
    // Java: ImmutableMap.copyOf(fields), which keeps the given map's iteration order
    private readonly fields: ReadonlyMap<ExpressionIdentifier, DataType>;

    public constructor(fields: Iterable<readonly [ExpressionIdentifier, DataType]>)
    {
        super();
        this.fields = new Map(fields);
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof RecordDataType)) return false;
        return javaEquals(this.fields, o.fields);
    }

    public override hashCode(): number
    {
        return javaObjectsHash(this.fields);
    }

    public override apply<R>(visitor: DataTypeVisitorEx<R>): R
    {
        return visitor.record(this.fields);
    }
}

class ListDataType extends DataType
{
    private readonly inner: DataType;

    public constructor(inner: DataType)
    {
        super();
        this.inner = inner;
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof ListDataType)) return false;
        return this.inner.equals(o.inner);
    }

    public override hashCode(): number
    {
        return javaObjectsHash(this.inner);
    }

    public override apply<R>(visitor: DataTypeVisitorEx<R>): R
    {
        return visitor.array(this.inner);
    }
}

class FunctionDataType extends DataType
{
    private readonly argType: readonly DataType[];
    private readonly resultType: DataType;

    public constructor(argType: readonly DataType[], resultType: DataType)
    {
        super();
        this.argType = argType;
        this.resultType = resultType;
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof FunctionDataType)) return false;
        return javaEquals(this.argType, o.argType) &&
            this.resultType.equals(o.resultType);
    }

    public override hashCode(): number
    {
        return javaObjectsHash(this.argType, this.resultType);
    }

    public override apply<R>(visitor: DataTypeVisitorEx<R>): R
    {
        // Java: the visitor's default function method throws
        if (visitor.function === undefined)
            throw new InternalException("Functions are unsupported, plain data values expected");
        return visitor.function(this.argType, this.resultType);
    }
}

const NUMBER_INSTANCE: DataType = DataType.number(NumberInfo.DEFAULT);
const BOOLEAN_INSTANCE: DataType = new BooleanDataType();
const TEXT_INSTANCE: DataType = new TextDataType();
