// Port of xyz.columnal.data.datatype.DataTypeValue (types module).
// The nested interfaces GetValue, DataTypeVisitorGetEx, DataTypeVisitorGet and OverrideSet and the
// nested class SpecificDataTypeVisitorGet are top-level exports.
import type { ExpressionIdentifier } from "../../../anns/Annotations.js";
import type { Decimal } from "../../../java/JavaBigDecimal.js";
import type { TemporalAccessor } from "../../../java/time/TemporalAccessor.js";
import { Either } from "../../../utility-adt/utility/adt/Either.js";
import { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../utility-error/error/InternalException.js";
import { UserException } from "../../../utility-error/error/UserException.js";
import type { TaggedValue } from "../../../utility/utility/TaggedValue.js";
import type { ListEx, Record } from "../../../utility/utility/Utility.js";
import type { Value } from "../../../utility/utility/Value.js";
import { UnknownTypeException } from "../../jellytype/JellyTypes.js";
import type { Unit } from "../unit/Unit.js";
import { DataType, ValueClass, type TagType } from "./DataType.js";
import type { DateTimeInfo } from "./DateTimeInfo.js";
import type { NumberInfo } from "./NumberInfo.js";
import type { ProgressListener } from "./ProgressListener.js";
import { TaggedTypeDefinition } from "./TaggedTypeDefinition.js";
import type { TypeId } from "./TypeId.js";
import type { TypeManager } from "./TypeManager.js";

/**
 * Java: interface GetValue<T> with default get and set methods.  Here an abstract class;
 * GetValue.of makes one from a function, as a Java lambda would.
 */
export abstract class GetValue<T extends Value>
{
    public abstract getWithProgress(index: number, progressListener: ProgressListener | null): T;

    public get(index: number): T
    {
        return this.getWithProgress(index, null);
    }

    public set(_index: number, _value: Either<string, T>): void
    {
        throw new InternalException("Attempted to set value for uneditable column: class " + this.constructor.name);
    }

    /** Java: a lambda implementing GetValue */
    public static of<T extends Value>(getWithProgress: (index: number, progressListener: ProgressListener | null) => T): GetValue<T>
    {
        return new class extends GetValue<T>
        {
            public override getWithProgress(index: number, progressListener: ProgressListener | null): T
            {
                return getWithProgress(index, progressListener);
            }
        }();
    }
}

/** Java: DataTypeVisitorGetEx<R, E extends Throwable> */
export interface DataTypeVisitorGetEx<R>
{
    number(g: GetValue<Decimal>, displayInfo: NumberInfo): R;
    text(g: GetValue<string>): R;
    bool(g: GetValue<boolean>): R;
    date(dateTimeInfo: DateTimeInfo, g: GetValue<TemporalAccessor>): R;
    tagged(typeName: TypeId, typeVars: readonly Either<Unit, DataType>[], tagTypes: readonly TagType<DataType>[], g: GetValue<TaggedValue>): R;
    record(types: ReadonlyMap<ExpressionIdentifier, DataType>, g: GetValue<Record>): R;
    // Each item is an array.  The inner type gives the type
    // of each entry
    array(inner: DataType, g: GetValue<ListEx>): R;
}

/** Java: DataTypeVisitorGet<R> extends DataTypeVisitorGetEx<R, UserException> */
export type DataTypeVisitorGet<R> = DataTypeVisitorGetEx<R>;

export class SpecificDataTypeVisitorGet<R> implements DataTypeVisitorGet<R>
{
    private readonly internal: InternalException | null = null;
    private readonly user: UserException | null = null;
    private readonly value: R | null = null;

    // Java has three constructors: (InternalException), (UserException) and (R value).
    public constructor(arg: InternalException | UserException | R)
    {
        if (arg instanceof InternalException)
            this.internal = arg;
        else if (arg instanceof UserException)
            this.user = arg;
        else
            this.value = arg;
    }

    public number(_g: GetValue<Decimal>, _displayInfo: NumberInfo): R
    {
        return this.defaultOp("Unexpected number data type");
    }

    private defaultOp(msg: string): R
    {
        if (this.internal !== null)
            throw this.internal;
        if (this.user !== null)
            throw this.user;
        if (this.value !== null)
            return this.value;
        throw new InternalException(msg);
    }

    public text(_g: GetValue<string>): R
    {
        return this.defaultOp("Unexpected text data type");
    }

    public tagged(_typeName: TypeId, _typeVars: readonly Either<Unit, DataType>[], _tags: readonly TagType<DataType>[], _g: GetValue<TaggedValue>): R
    {
        return this.defaultOp("Unexpected tagged data type");
    }

    public bool(_g: GetValue<boolean>): R
    {
        return this.defaultOp("Unexpected boolean type");
    }

    public date(_dateTimeInfo: DateTimeInfo, _g: GetValue<TemporalAccessor>): R
    {
        return this.defaultOp("Unexpected date type");
    }

    public record(_types: ReadonlyMap<ExpressionIdentifier, DataType>, _g: GetValue<Record>): R
    {
        return this.defaultOp("Unexpected record type");
    }

    public array(_inner: DataType, _g: GetValue<ListEx>): R
    {
        return this.defaultOp("Unexpected array type");
    }
}

/** Java: a functional interface */
export type OverrideSet = (index: number, value: Either<string, Value>) => void;

/**
 * The data-type of a homogeneously-typed list of values,
 * including a facility to get the item at a particular index.
 */
export class DataTypeValue
{
    private readonly dataType: DataType;
    private readonly getNumber: GetValue<Decimal> | null;
    private readonly getText: GetValue<string> | null;
    private readonly getDate: GetValue<TemporalAccessor> | null;
    private readonly getBoolean: GetValue<boolean> | null;
    private readonly getTag: GetValue<TaggedValue> | null;
    private readonly getRecord: GetValue<Record> | null;
    private readonly getArrayContent: GetValue<ListEx> | null;

    // Java: package-visible
    private constructor(dataType: DataType, getNumber: GetValue<Decimal> | null, getText: GetValue<string> | null, getDate: GetValue<TemporalAccessor> | null, getBoolean: GetValue<boolean> | null, getTag: GetValue<TaggedValue> | null, getRecord: GetValue<Record> | null, getArrayContent: GetValue<ListEx> | null)
    {
        this.dataType = dataType;
        this.getNumber = getNumber;
        this.getText = getText;
        this.getDate = getDate;
        this.getBoolean = getBoolean;
        this.getTag = getTag;
        this.getRecord = getRecord;
        this.getArrayContent = getArrayContent;
    }

    public static bool(getValue: GetValue<boolean>): DataTypeValue
    {
        return new DataTypeValue(DataType.BOOLEAN, null, null, null, getValue, null, null, null);
    }

    public static tagged(name: TypeId, tagTypeVariableSubsts: readonly Either<Unit, DataType>[], tagTypes: readonly TagType<DataType>[], getTag: GetValue<TaggedValue>): DataTypeValue
    {
        return new DataTypeValue(DataType.tagged(name, tagTypeVariableSubsts, tagTypes), null, null, null, null, getTag, null, null);
    }

    public static text(getText: GetValue<string>): DataTypeValue
    {
        return new DataTypeValue(DataType.TEXT, null, getText, null, null, null, null, null);
    }

    public static date(dateTimeInfo: DateTimeInfo, getDate: GetValue<TemporalAccessor>): DataTypeValue
    {
        return new DataTypeValue(DataType.date(dateTimeInfo), null, null, getDate, null, null, null, null);
    }

    public static number(numberInfo: NumberInfo, getNumber: GetValue<Decimal>): DataTypeValue
    {
        return new DataTypeValue(DataType.number(numberInfo), getNumber, null, null, null, null, null, null);
    }

    public static array(innerType: DataType, getContent: GetValue<ListEx>): DataTypeValue
    {
        return new DataTypeValue(DataType.array(innerType), null, null, null, null, null, null, getContent);
    }

    public static record(fields: Iterable<readonly [ExpressionIdentifier, DataType]>, getContent: GetValue<Record>): DataTypeValue
    {
        return new DataTypeValue(DataType.record(fields), null, null, null, null, null, getContent, null);
    }

    public setCollapsed(rowIndex: number, value: Either<string, Value>): void
    {
        // Java: set(g, castTo), which casts each value with Class.cast
        function set<T extends Value>(g: GetValue<T>, castTo: ValueClass<T>): void
        {
            g.set(rowIndex, value.map<T>(v => ValueClass.cast(castTo, v)));
        }

        this.applyGet<null>({
            number(g: GetValue<Decimal>, _displayInfo: NumberInfo): null
            {
                set(g, ValueClass.NUMBER);
                return null;
            },

            text(g: GetValue<string>): null
            {
                set(g, ValueClass.STRING);
                return null;
            },

            bool(g: GetValue<boolean>): null
            {
                set(g, ValueClass.BOOLEAN);
                return null;
            },

            date(_dateTimeInfo: DateTimeInfo, g: GetValue<TemporalAccessor>): null
            {
                set(g, ValueClass.TEMPORAL);
                return null;
            },

            tagged(_typeName: TypeId, _typeVars: readonly Either<Unit, DataType>[], _tagTypes: readonly TagType<DataType>[], g: GetValue<TaggedValue>): null
            {
                set(g, ValueClass.TAGGED);
                return null;
            },

            record(_types: ReadonlyMap<ExpressionIdentifier, DataType>, g: GetValue<Record>): null
            {
                set(g, ValueClass.RECORD);
                return null;
            },

            array(_inner: DataType, g: GetValue<ListEx>): null
            {
                set(g, ValueClass.LIST);
                return null;
            },
        });
    }

    public getType(): DataType
    {
        return this.dataType;
    }

    // Java passes the (possibly null) getters on regardless of nullness:
    public applyGet<R>(visitor: DataTypeVisitorGetEx<R>): R
    {
        return this.dataType.apply<R>({
            number: (numberInfo: NumberInfo): R => visitor.number(this.getNumber!, numberInfo),
            text: (): R => visitor.text(this.getText!),
            date: (dateTimeInfo: DateTimeInfo): R => visitor.date(dateTimeInfo, this.getDate!),
            bool: (): R => visitor.bool(this.getBoolean!),
            tagged: (typeName: TypeId, typeVars: readonly Either<Unit, DataType>[], tags: readonly TagType<DataType>[]): R => visitor.tagged(typeName, typeVars, tags, this.getTag!),
            record: (fields: ReadonlyMap<ExpressionIdentifier, DataType>): R => visitor.record(fields, this.getRecord!),
            array: (inner: DataType): R => visitor.array(inner, this.getArrayContent!),
            function: (_argTypes: readonly DataType[], _resultType: DataType): R =>
            {
                throw new InternalException("Cannot store collections of functions");
            },
        });
    }

    /**
     * Gets the collapsed, dynamically typed value at the given index
     *
     * Number: Byte/Short/Integer/Long/BigDecimal
     * Text: String
     * Boolean: Boolean
     * Datetime: LocalDate/LocalTime/ZonedDateTime/....
     * Tagged type: TaggedValue
     * Tuple: array
     * Array: List
     */
    public getCollapsed(index: number): Value
    {
        return this.applyGet<Value>({
            number: g => g.get(index),
            text: g => g.get(index),
            tagged: (_typeName, _typeVars, _tagTypes, g) => g.get(index),
            record: (_types, g) => g.get(index),
            array: (_inner, g) => g.get(index),
            bool: g => g.get(index),
            date: (_dateTimeInfo, g) => g.get(index),
        });
    }

    /**
     * Copies the type of this item, but allows you to pull the data from an arbitrary DataTypeValue
     * (i.e. not necessarily the original).  Useful for implementing concat, sort and similar, as it
     * allows arbitrary mapping of an index back to any index of any DataTypeValue.
     *
     * @param original The original type which we are copying from
     * @param getOriginalValueAndIndex A function which takes the final index which we are interested
     *                                 in and gives back the DataTypeValue to draw from, and the index
     *                                 to ask for that in that DataTypeValue.  Any DataTypeValue returned
     *                                 must be of the same type as original.
     */
    public static copySeveral(original: DataType, getOriginalValueAndIndex: (index: number) => Pair<DataTypeValue, number>): DataTypeValue
    {
        return new DataTypeValue(original,
            DataTypeValue.several<Decimal>(getOriginalValueAndIndex, dtv => dtv.getNumber),
            DataTypeValue.several<string>(getOriginalValueAndIndex, dtv => dtv.getText),
            DataTypeValue.several<TemporalAccessor>(getOriginalValueAndIndex, dtv => dtv.getDate),
            DataTypeValue.several<boolean>(getOriginalValueAndIndex, dtv => dtv.getBoolean),
            DataTypeValue.several<TaggedValue>(getOriginalValueAndIndex, dtv => dtv.getTag),
            DataTypeValue.several<Record>(getOriginalValueAndIndex, dtv => dtv.getRecord),
            DataTypeValue.several<ListEx>(getOriginalValueAndIndex, dtv => dtv.getArrayContent));
    }

    /**
     * The function maps a destination index to an index in the original DataTypeValue (this).
     */
    public copyReorder(mapToOriginalIndex: (index: number) => number): DataTypeValue
    {
        return DataTypeValue.copySeveral(this.dataType, i => new Pair<DataTypeValue, number>(this, mapToOriginalIndex(i)));
    }

    /**
     * The function maps a destination index to either an empty optional (null) or an index in the original DataTypeValue (this) which will get wrapped into an optional.
     * @param mapToOriginalIndex
     * @return
     * @throws InternalException
     */
    public copyReorderWrapOptional(typeManager: TypeManager, mapToOriginalIndex: (index: number) => number | null): DataTypeValue
    {
        try
        {
            const maybeType = typeManager.getMaybeType().instantiate([Either.right<Unit, DataType>(this.dataType)], typeManager);
            return DataTypeValue.copySeveral(maybeType, i => {
                const mapped = mapToOriginalIndex(i);
                if (mapped === null)
                    return new Pair<DataTypeValue, number>(maybeType.fromCollapsed(GetValue.of((_a, _b) => typeManager.maybeMissing())), 0);
                else
                    return new Pair<DataTypeValue, number>(maybeType.fromCollapsed(GetValue.of((j, _b) => typeManager.maybePresent(this.getCollapsed(j)))), mapped);
            });
        }
        catch (e)
        {
            if (!(e instanceof TaggedTypeDefinition.TaggedInstantiationException || e instanceof UnknownTypeException))
                throw e;
            throw new InternalException("Cannot find optional type", e);
        }
    }

    private static several<T extends Value>(getOriginalIndex: (index: number) => Pair<DataTypeValue, number>, g: ((dtv: DataTypeValue) => GetValue<T> | null) | null): GetValue<T> | null
    {
        if (g === null)
            return null;
        const gFinal = g;
        return GetValue.of((destIndex: number, prog: ProgressListener | null) => {
            const src = getOriginalIndex(destIndex);
            const innerGet = gFinal(src.getFirst());
            if (innerGet === null)
                throw new InternalException("Inner get in several was null");
            return innerGet.getWithProgress(src.getSecond(), prog === null ? null : prog);
        });
    }

    /**
     * A copy of this DataTypeValue with the given set operation
     */
    public withSet(set: OverrideSet): DataTypeValue
    {
        function overrideSet<T extends Value>(g: GetValue<T>): GetValue<T>
        {
            return new class extends GetValue<T>
            {
                public override getWithProgress(index: number, progressListener: ProgressListener | null): T
                {
                    return g.getWithProgress(index, progressListener);
                }

                public override set(index: number, value: Either<string, T>): void
                {
                    set(index, value.map<Value>(t => t));
                }
            }();
        }

        return this.applyGet<DataTypeValue>({
            number: (g, displayInfo) => DataTypeValue.number(displayInfo, overrideSet(g)),
            text: g => DataTypeValue.text(overrideSet(g)),
            bool: g => DataTypeValue.bool(overrideSet(g)),
            date: (dateTimeInfo, g) => DataTypeValue.date(dateTimeInfo, overrideSet(g)),
            tagged: (typeName, typeVars, tagTypes, g) => DataTypeValue.tagged(typeName, typeVars, tagTypes, overrideSet(g)),
            record: (types, g) => DataTypeValue.record(types, overrideSet(g)),
            array: (inner, g) => DataTypeValue.array(inner, overrideSet(g)),
        });
    }
}
