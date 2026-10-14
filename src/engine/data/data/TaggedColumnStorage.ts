// Port of xyz.columnal.data.TaggedColumnStorage (data module).
import { Decimal } from "../../java/JavaBigDecimal.js";
import type { TypeId } from "../../types/data/datatype/TypeId.js";
import { TagType, type DataType } from "../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../types/data/datatype/DataTypeUtility.js";
import { DataTypeValue } from "../../types/data/datatype/DataTypeValue.js";
import type { Unit } from "../../types/data/unit/Unit.js";
import { Either } from "../../utility-adt/utility/adt/Either.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { InvalidImmediateValueException } from "../../utility-error/error/InvalidImmediateValueException.js";
import type { SimulationRunnable } from "../../utility-functional/utility/function/simulation/SimulationRunnable.js";
import { TaggedValue } from "../../utility/utility/TaggedValue.js";
import type { Value } from "../../utility/utility/Value.js";
import { ColumnUtility } from "./ColumnUtility.js";
import type { ColumnStorage } from "./ColumnStorage.js";
import { SparseErrorColumnStorage } from "./SparseErrorColumnStorage.js";
import { NumericColumnStorage } from "./NumericColumnStorage.js";

/**
 * Created by neil on 05/11/2016.
 */
export class TaggedColumnStorage extends SparseErrorColumnStorage<TaggedValue> implements ColumnStorage<TaggedValue>
{
    // This stores the tag index of each item.
    private readonly tagStore: NumericColumnStorage;
    // This stores the inner values
    private readonly tagTypes: readonly TagType<ColumnStorage<Value>>[];
    // Effectively a cached version of tagTypes:
    private readonly dataType: DataTypeValue;

    // Java has two constructors: with and without beforeGet.
    public constructor(typeName: TypeId, typeVars: readonly Either<Unit, DataType>[], copyTagTypes: readonly TagType<DataType>[], isImmediateData: boolean);
    public constructor(typeName: TypeId, typeVars: readonly Either<Unit, DataType>[], copyTagTypes: readonly TagType<DataType>[], beforeGet: ColumnStorage.BeforeGet<TaggedColumnStorage> | null, isImmediateData: boolean);
    public constructor(typeName: TypeId, typeVars: readonly Either<Unit, DataType>[], copyTagTypes: readonly TagType<DataType>[], d: ColumnStorage.BeforeGet<TaggedColumnStorage> | null | boolean, e?: boolean)
    {
        const isImmediateData = typeof d === "boolean" ? d : e!;
        const beforeGet = typeof d === "boolean" ? null : d;
        super(isImmediateData);
        this.tagStore = new NumericColumnStorage(isImmediateData);
        const tagTypesBuilder: TagType<ColumnStorage<Value>>[] = [];
        for (let i = 0; i < copyTagTypes.length; i++)
        {
            const tagType = copyTagTypes[i]!;
            const inner = tagType.getInner();
            if (inner !== null)
            {
                const result = ColumnUtility.makeColumnStorage(inner, null, isImmediateData);
                tagTypesBuilder.push(new TagType(tagType.getName(), result));
            }
            else
            {
                tagTypesBuilder.push(new TagType<ColumnStorage<Value>>(tagType.getName(), null));
            }
        }
        const tagTypes = tagTypesBuilder;
        this.tagTypes = tagTypes;
        const tagStore = this.tagStore;
        this.dataType = DataTypeValue.tagged(typeName, typeVars, tagTypes.map(tt => tt.map(t => t.getType().getType())), this.getValueOrError<TaggedValue>({
            _beforeGet: (i, prog) =>
            {
                if (beforeGet !== null)
                    beforeGet(this, i, prog);
            },

            _getWithProgress: (i, _prog) =>
            {
                const tagIndex = tagStore.getInt(i);
                if (tagIndex >= tagTypes.length)
                    throw new InternalException("Found tag index " + tagIndex + " but only know of " + tagTypes.length + " tags");
                const innerStorage = tagTypes[tagIndex]!.getInner();
                if (innerStorage === null)
                    return new TaggedValue(tagIndex, null, DataTypeUtility.fromTags(tagTypes));
                else
                    return new TaggedValue(tagIndex, innerStorage.getType().getCollapsed(i), DataTypeUtility.fromTags(tagTypes));
            },

            _set: (index, newValue) =>
            {
                // Java: int oldTag = tagStore.getInt(index); (unused, but it fails for a bad index)
                tagStore.getInt(index);
                const newTag = newValue === null ? null : newValue.getTagIndex();

                tagStore.set(index, new Decimal(newTag === null ? 0 : newTag));

                for (let tagIndex = 0; tagIndex < tagTypes.length; tagIndex++)
                {
                    const colStore = tagTypes[tagIndex]!.getInner();
                    if (colStore !== null)
                    {
                        // Remember that newTag may be null:
                        if (tagIndex === newTag && newValue !== null)
                        {
                            const newValueInner = newValue.getInner();
                            if (newValueInner === null)
                                throw new InternalException("Found blank inner value for tag which expects an inner value, tag " + tagIndex + " type: " + typeName.toString());
                            colStore.getType().setCollapsed(index, Either.right(newValueInner));
                        }
                        else
                            colStore.getType().setCollapsed(index, Either.left("Attempting to fetch tagged inner value for invalid row"));
                    }

                }
            },
        }));
    }

    public getType(): DataTypeValue
    {
        return this.dataType;
    }

    protected override _insertRows(insertAtOriginalIndex: number, insertItems: readonly (TaggedValue | null)[]): SimulationRunnable
    {
        const insertAtIndex = insertAtOriginalIndex;
        this.tagStore.addAll(insertAtIndex, insertItems.map(t => new Decimal(t === null ? 0 : t.getTagIndex())));
        for (let i = 0; i < this.tagTypes.length; i++)
        {
            const iFinal = i;
            const colStore = this.tagTypes[i]!.getInner();
            if (colStore !== null)
                colStore.insertRows(insertAtIndex, insertItems.map((t: TaggedValue | null) =>
                {
                    if (t === null)
                        return Either.left<string, Value>("Internal tagged error");
                    else if (t.getTagIndex() === iFinal && t.getInner() !== null)
                        return Either.right<string, Value>(t.getInner()!);
                    else
                        return Either.left<string, Value>("Internal tagged error");
                }));
        }

        const insertCount = insertItems.length;
        return () => { this._removeRows(insertAtOriginalIndex, insertCount); };
    }

    protected override _removeRows(index: number, count: number): SimulationRunnable
    {
        const reInsert: SimulationRunnable[] = [];
        // Now actually remove everything:
        reInsert.push(this.tagStore.removeRows(index, count));
        for (const tagType of this.tagTypes)
        {
            const inner = tagType.getInner();
            if (inner !== null)
                reInsert.push(inner.removeRows(index, count));
        }

        return () =>
        {
            for (const re of reInsert)
            {
                re();
            }
        };
    }

    public filled(): number
    {
        return this.tagStore.filled();
    }

    public addAll(values: Iterable<Either<string, TaggedValue>>): void
    {
        this.insertRows(this.filled(), [...values]);
    }

    public getShrunk(shrunkLength: number): Either<string, TaggedValue>[]
    {
        const s: Either<string, TaggedValue>[] = [];
        for (let i = 0; i < shrunkLength; i++)
        {
            try
            {
                s.push(Either.right(this.getType().getCollapsed(i) as TaggedValue));
            }
            catch (e)
            {
                if (!(e instanceof InvalidImmediateValueException))
                    throw e;
                s.push(Either.left(e.getInvalid()));
            }

        }
        return s;
    }
}
