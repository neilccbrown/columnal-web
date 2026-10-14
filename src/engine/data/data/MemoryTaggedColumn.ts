// Port of xyz.columnal.data.MemoryTaggedColumn (data module).
import type { ColumnId } from "../../identifiers/id/ColumnId.js";
import { SpecificDataTypeVisitor, type DataType, type TagType } from "../../types/data/datatype/DataType.js";
import type { DataTypeValue } from "../../types/data/datatype/DataTypeValue.js";
import type { TypeId } from "../../types/data/datatype/TypeId.js";
import type { Unit } from "../../types/data/unit/Unit.js";
import { Either } from "../../utility-adt/utility/adt/Either.js";
import type { SimulationRunnable } from "../../utility-functional/utility/function/simulation/SimulationRunnable.js";
import type { TaggedValue } from "../../utility/utility/TaggedValue.js";
import { Utility } from "../../utility/utility/Utility.js";
import type { Value } from "../../utility/utility/Value.js";
import type { Column } from "./Column.js";
import { EditableColumn } from "./EditableColumn.js";
import type { RecordSet } from "./RecordSet.js";
import { TaggedColumnStorage } from "./TaggedColumnStorage.js";

/**
 * Created by neil on 30/11/2016.
 */
export class MemoryTaggedColumn extends EditableColumn
{
    private readonly storage: TaggedColumnStorage;
    private readonly typeName: TypeId;
    private readonly defaultValue: TaggedValue;
    private readonly typeVars: readonly Either<Unit, DataType>[];

    public constructor(rs: RecordSet, title: ColumnId, typeName: TypeId, typeVars: readonly Either<Unit, DataType>[], tags: readonly TagType<DataType>[], values: readonly Either<string, TaggedValue>[], defaultValue: TaggedValue)
    {
        super(rs, title);
        this.typeName = typeName;
        this.typeVars = typeVars;
        this.defaultValue = defaultValue;
        this.storage = new TaggedColumnStorage(typeName, typeVars, tags, true);
        this.storage.addAll(values);
    }

    public getType(): DataTypeValue
    {
        return this.storage.getType();
    }

    public override _test_shrink(rs: RecordSet, shrunkLength: number): Column
    {
        const tags = this.getType().getType().apply(new class extends SpecificDataTypeVisitor<readonly TagType<DataType>[]>
        {
            public override tagged(_typeName: TypeId, _typeVars: readonly Either<Unit, DataType>[], tags: readonly TagType<DataType>[]): readonly TagType<DataType>[]
            {
                return tags;
            }
        }());
        return new MemoryTaggedColumn(rs, this.getName(), this.typeName, this.typeVars, tags, this.storage.getShrunk(shrunkLength), this.defaultValue);
    }

    public add(taggedValue: Either<string, TaggedValue>): void
    {
        this.storage.addAll([taggedValue]);
    }


    public insertRows(index: number, count: number): SimulationRunnable
    {
        return this.storage.insertRows(index, Utility.replicate(count, Either.right<string, TaggedValue>(this.defaultValue)));
    }

    public removeRows(index: number, count: number): SimulationRunnable
    {
        return this.storage.removeRows(index, count);
    }

    public getDefaultValue(): Value
    {
        return this.defaultValue;
    }
}
