// Port of xyz.columnal.jellytype.JellyTypePrimitive (types module).
// Import JellyType and its subclasses from JellyTypes.ts (which see).
import { javaEquals, javaObjectsHash } from "../../java/JavaObject.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { Log } from "../../utility/log/Log.js";
import { DataType } from "../data/datatype/DataType.js";
import type { DateTimeInfo } from "../data/datatype/DateTimeInfo.js";
import type { TypeId } from "../data/datatype/TypeId.js";
import type { OutputBuilder } from "../loadsave/OutputBuilder.js";
import { TypeExp } from "../typeExp/TypeExps.js";
import { JellyType, type JellyTypeVisitorEx } from "./JellyTypes.js";

// Java: package-visible class
export class JellyTypePrimitive extends JellyType
{
    private readonly dataType: DataType;

    private constructor(dataType: DataType)
    {
        super();
        this.dataType = dataType;
    }

    public static bool(): JellyTypePrimitive
    {
        return new JellyTypePrimitive(DataType.BOOLEAN);
    }

    public static override text(): JellyTypePrimitive
    {
        return new JellyTypePrimitive(DataType.TEXT);
    }

    public static date(dateTimeInfo: DateTimeInfo): JellyTypePrimitive
    {
        return new JellyTypePrimitive(DataType.date(dateTimeInfo));
    }

    public override makeTypeExp(): TypeExp
    {
        return TypeExp.fromDataType(null, this.dataType);
    }

    public override makeDataType(): DataType
    {
        return this.dataType;
    }

    public override save(output: OutputBuilder): void
    {
        try
        {
            this.dataType.save(output);
        }
        catch (e)
        {
            if (!(e instanceof InternalException))
                throw e;
            Log.log(e);
            // Not sure what more we can do here: write rest and
            // hope user can fix it later, I guess.
        }
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof JellyTypePrimitive) || o.constructor !== this.constructor) return false;
        return javaEquals(this.dataType, o.dataType);
    }

    public override hashCode(): number
    {
        return javaObjectsHash(this.dataType);
    }

    public override forNestedTagged(_nestedTagged: (typeId: TypeId) => void): void
    {
        // No nested tagged types
    }

    public override apply<R>(visitor: JellyTypeVisitorEx<R>): R
    {
        const dataType = this.dataType;
        function _throw(): R
        {
            throw new InternalException("Impossible type " + dataType.toString() + " found in JellyTypePrimitive");
        }
        return this.dataType.apply<R>({
            text: () => visitor.text(),
            date: dateTimeInfo => visitor.date(dateTimeInfo),
            bool: () => visitor.bool(),
            number: _numberInfo => _throw(),
            tagged: (_typeName, _typeVars, _tags) => _throw(),
            record: _fields => _throw(),
            array: _inner => _throw(),
            function: (_argTypes, _resultType) => _throw(),
        });
    }

    public override toString(): string
    {
        return "JellyTypePrimitive{" +
                "dataType=" + this.dataType.toString() +
                "}";
    }
}
