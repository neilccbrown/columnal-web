// Port of xyz.columnal.transformations.function.ToString (functions module).
import type { ExpressionIdentifier } from "../../../anns/Annotations.js";
import { ValueFunction } from "../../../expressions/transformations/expression/function/ValueFunction.js";
import { Decimal } from "../../../java/JavaBigDecimal.js";
import { GrammarUtility } from "../../../parsers/grammar/GrammarUtility.js";
import { ValueClass, type DataType, type DataTypeVisitorEx, type TagType } from "../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import type { DateTimeInfo } from "../../../types/data/datatype/DateTimeInfo.js";
import type { NumberInfo } from "../../../types/data/datatype/NumberInfo.js";
import type { TypeId } from "../../../types/data/datatype/TypeId.js";
import type { TypeManager } from "../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../types/data/unit/Unit.js";
import type { Either } from "../../../utility-adt/utility/adt/Either.js";
import { TaggedValue } from "../../../utility/utility/TaggedValue.js";
import { ListEx, Record, Utility } from "../../../utility/utility/Utility.js";
import type { Value } from "../../../utility/utility/Value.js";
import { FunctionDefinition } from "./FunctionDefinition.js";

export class ToString extends FunctionDefinition
{
    public constructor()
    {
        super("conversion:to text");
    }

    public override getInstance(_typeManager: TypeManager, paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        // Java then checks for null, which getRight never returns
        const type = paramTypes("t").getRight("Variable t should be type but was unit");
        return new ToString.Instance(type);
    }
}

export namespace ToString
{
    export class Instance extends ValueFunction
    {
        private readonly type: DataType;

        public constructor(type: DataType)
        {
            super();
            this.type = type;
        }

        public override _call(): Value
        {
            return DataTypeUtility.value(Instance.convertToString(this.type, this.arg(0)));
        }

        private static convertToString(type: DataType, param: Value): string
        {
            return type.apply<string>(new class implements DataTypeVisitorEx<string>
            {
                public number(_numberInfo: NumberInfo): string
                {
                    return Utility.numberToString(Utility.cast(param, Decimal));
                }

                public text(): string
                {
                    return "\"" + GrammarUtility.escapeChars(Utility.cast(param, String)) + "\"";
                }

                public date(dateTimeInfo: DateTimeInfo): string
                {
                    // Java: Utility.cast(param, TemporalAccessor.class)
                    return dateTimeInfo.getStrictFormatter().format(ValueClass.cast(ValueClass.TEMPORAL, param));
                }

                public bool(): string
                {
                    return param.toString();
                }

                public tagged(_typeName: TypeId, _typeVars: readonly Either<Unit, DataType>[], tags: readonly TagType<DataType>[]): string
                {
                    const taggedValue = Utility.cast(param, TaggedValue);
                    const tag = tags[taggedValue.getTagIndex()]!;
                    const inner = taggedValue.getInner();
                    const tagInner = tag.getInner();
                    return tag.getName() + ((inner === null || tagInner === null) ? "" : ("(" + Instance.convertToString(tagInner, inner) + ")"));
                }

                public record(fields: ReadonlyMap<ExpressionIdentifier, DataType>): string
                {
                    const values = Utility.cast(param, Record);
                    let s = "(";
                    let first = true;
                    for (const [key, value] of fields)
                    {
                        if (!first)
                            s += ", ";
                        first = false;
                        s += key + ": ";
                        s += Instance.convertToString(value, values.getField(key));
                    }
                    return s + ")";
                }

                public array(inner: DataType | null): string
                {
                    if (inner === null)
                        return "[]";

                    const listEx = Utility.cast(param, ListEx);
                    let s = "[";
                    for (let i = 0; i < listEx.size(); i++)
                    {
                        if (i > 0)
                            s += ", ";
                        s += Instance.convertToString(inner, listEx.get(i));
                    }
                    return s + "]";
                }
            }());
        }
    }
}
