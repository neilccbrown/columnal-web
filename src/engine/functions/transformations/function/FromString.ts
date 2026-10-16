// Port of xyz.columnal.transformations.function.FromString (functions module).
import type { ExpressionIdentifier, FuncDocKey } from "../../../anns/Annotations.js";
import { ValueFunction } from "../../../expressions/transformations/expression/function/ValueFunction.js";
import { HashMap } from "../../../java/HashMap.js";
import { javaTrim } from "../../../java/JavaString.js";
import { GrammarUtility } from "../../../parsers/grammar/GrammarUtility.js";
import type { DataType, DataTypeVisitorEx, TagType } from "../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import type { DateTimeInfo } from "../../../types/data/datatype/DateTimeInfo.js";
import type { NumberInfo } from "../../../types/data/datatype/NumberInfo.js";
import type { TypeId } from "../../../types/data/datatype/TypeId.js";
import type { TypeManager } from "../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../types/data/unit/Unit.js";
import type { Either } from "../../../utility-adt/utility/adt/Either.js";
import { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { UserException } from "../../../utility-error/error/UserException.js";
import { IdentifierUtility } from "../../../utility/utility/IdentifierUtility.js";
import { TaggedValue } from "../../../utility/utility/TaggedValue.js";
import { ListEx, ListExList, RecordMap, Utility } from "../../../utility/utility/Utility.js";
import type { Value } from "../../../utility/utility/Value.js";
import { FunctionDefinition } from "./FunctionDefinition.js";

export class FromString
{

    public static readonly FROM_TEXT_TO: FuncDocKey = "conversion:from text to";

    public static getFunctions(): readonly FunctionDefinition[]
    {
        return [
            new class extends FunctionDefinition
            {
                public override getInstance(_typeManager: TypeManager, paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
                {
                    // Java then checks for null, which getRight never returns
                    const type = paramTypes("t").getRight("Variable t should be type but was unit");
                    return new class extends ValueFunction
                    {
                        public override _call(): Value
                        {
                            return FromString.convertEntireString(this.arg(0), type);
                        }
                    }();
                }
            }("conversion:from text"),
            new class extends FunctionDefinition
            {
                public override getInstance(_typeManager: TypeManager, paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
                {
                    // Java then checks for null, which getRight never returns
                    const type = paramTypes("t").getRight("Variable t should be type but was unit");
                    return new class extends ValueFunction
                    {
                        public override _call(): Value
                        {
                            return FromString.convertEntireString(this.arg(1), type);
                        }
                    }();
                }
            }(FromString.FROM_TEXT_TO),
        ];
    }

    public static _test_fromString(s: string, type: DataType): Value
    {
        return FromString.convertEntireString(DataTypeUtility.value(s), type);
    }

    public static convertEntireString(arg: Value, type: DataType): Value
    {
        const src = Utility.cast(arg, String);
        const stringView = new DataTypeUtility.StringView(src);
        stringView.skipSpaces();
        const value = FromString.convertFromString(type, stringView);
        stringView.skipSpaces();
        if (stringView.getPosition() < src.length)
            throw new UserException("Entire string was not used during conversion to " + type.toString() + ", remainder: " + stringView.snippet() + " from original \"" + src + "\"");
        return value;
    }

    // The StringView gets modified as we process it.
        private static convertFromString(type: DataType, src: DataTypeUtility.StringView): Value
        {
            return type.apply<Value>(new class implements DataTypeVisitorEx<Value>
            {
                public number(_numberInfo: NumberInfo): Value
                {
                    // First, we need to consume the chars for the number:
                    let s = "";
                    if (src.tryRead("+"))
                    {
                        s += "+";
                    }
                    else if (src.tryRead("-"))
                    {
                        s += "-";
                    }
                    s += src.consumeNumbers();
                    if (src.tryRead("."))
                    {
                        s += "." + src.consumeNumbers();
                    }

                    return Utility.parseNumber(s);
                }

                public text(): Value
                {
                    if (!src.tryRead("\""))
                        throw new UserException("Expected start of string but found: " + src.snippet());
                    const content = src.readUntil("\"");
                    if (content !== null)
                        return DataTypeUtility.value(GrammarUtility.processEscapes("\"" + content + "\""));
                    else
                        throw new UserException("Could not find end of string");
                }

                public date(dateTimeInfo: DateTimeInfo): Value
                {
                    return DataTypeUtility.parseTemporalFlexible(dateTimeInfo, src);
                }

                public bool(): Value
                {
                    if (src.tryReadIgnoreCase("true"))
                        return DataTypeUtility.value(true);
                    else if (src.tryReadIgnoreCase("false"))
                        return DataTypeUtility.value(false);
                    else
                        throw new UserException("Expected boolean but found: " + src.snippet());
                }

                public tagged(_typeName: TypeId, _typeVars: readonly Either<Unit, DataType>[], tags: readonly TagType<DataType>[]): Value
                {
                    const indexedTags: Pair<number, TagType<DataType>>[] = [];
                    for (let i = 0; i < tags.length; i++)
                    {
                        indexedTags.push(new Pair(i, tags[i]!));
                    }
                    // Need to check longest tags first, otherwise we may consume a short tag
                    // which is a prefix of a longer tag's name.  Compare by negative length
                    // to put longest first:
                    indexedTags.sort((a, b) => (-a.getSecond().getName().length) - (-b.getSecond().getName().length));

                    for (const indexedTag of indexedTags)
                    {
                        if (src.tryRead(indexedTag.getSecond().getName()))
                        {
                            // Found it!
                            const innerType = indexedTag.getSecond().getInner();
                            if (innerType !== null)
                            {
                                if (!src.tryRead("("))
                                    throw new UserException("Tag name must be followed by round brackets around inner value");
                                const r = new TaggedValue(indexedTag.getFirst(), FromString.convertFromString(innerType, src), DataTypeUtility.fromTags(tags));
                                if (!src.tryRead(")"))
                                    throw new UserException("Missing closing round bracket around tag's inner value");
                                return r;
                            }
                            else
                            {
                                return new TaggedValue(indexedTag.getFirst(), null, DataTypeUtility.fromTags(tags));
                            }
                        }
                    }
                    throw new UserException("Looking for tags but found unrecognised tag: " + src.snippet());
                }

                public record(fields: ReadonlyMap<ExpressionIdentifier, DataType>): Value
                {
                    if (!src.tryRead("("))
                        throw new UserException("Expected record, but no opening round bracket, instead found: " + src.snippet());


                    // PORT-NOTE: Java's HashMap order, which the record's fields keep:
                    const items = HashMap.javaOrder<ExpressionIdentifier, Value>();
                    for (let i = 0; i < fields.size; i++)
                    {
                        if (i > 0)
                        {
                            // Must be comma if not first item:
                            if (!src.tryRead(","))
                                throw new UserException("Expected comma after record item but found: " + src.snippet());
                        }
                        const name = src.readUntil(":");
                        if (name === null)
                            throw new UserException("Expected field name followed by colon but found: " + src.snippet());
                        const nameId = IdentifierUtility.asExpressionIdentifier(javaTrim(name));
                        if (nameId === null)
                            throw new UserException("Invalid field name: " + name);
                        const type = fields.get(nameId);
                        if (type === undefined)
                            throw new UserException("Unknown field name: " + nameId);
                        items.set(nameId, FromString.convertFromString(type, src));
                    }
                    if (!src.tryRead(")"))
                        throw new UserException("Expected round bracket at end of record but found: " + src.snippet());
                    return DataTypeUtility.value(new RecordMap(items));
                }

                public array(inner: DataType | null): Value
                {
                    if (!src.tryRead("["))
                        throw new UserException("Expected list, but no opening square bracket, instead found: " + src.snippet());

                    if (src.tryRead("]"))
                        return ListEx.empty();
                    if (inner === null)
                        throw new UserException("Expected empty list but found data items: " + src.snippet());

                    const items: Value[] = [];
                    while (!src.tryRead("]"))
                    {
                        if (items.length !== 0)
                        {
                            // Must be comma if not first item:
                            if (!src.tryRead(","))
                                throw new UserException("Expected comma after list item but found " + src.snippet());
                        }
                        items.push(FromString.convertFromString(inner, src));
                    }
                    return new ListExList(items);
                }
            }());
        }

}
