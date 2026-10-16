// Port of test.gen.backwards.BackwardsColumnRef (tests-functions testFixtures).
import type { ExpressionIdentifier } from "../../../../../../src/engine/anns/Annotations.js";
import type { Column } from "../../../../../../src/engine/data/data/Column.js";
import { MemoryArrayColumn } from "../../../../../../src/engine/data/data/MemoryArrayColumn.js";
import { MemoryBooleanColumn } from "../../../../../../src/engine/data/data/MemoryBooleanColumn.js";
import { MemoryNumericColumn } from "../../../../../../src/engine/data/data/MemoryNumericColumn.js";
import { MemoryRecordColumn } from "../../../../../../src/engine/data/data/MemoryRecordColumn.js";
import { MemoryStringColumn } from "../../../../../../src/engine/data/data/MemoryStringColumn.js";
import { MemoryTaggedColumn } from "../../../../../../src/engine/data/data/MemoryTaggedColumn.js";
import { MemoryTemporalColumn } from "../../../../../../src/engine/data/data/MemoryTemporalColumn.js";
import type { RecordSet } from "../../../../../../src/engine/data/data/RecordSet.js";
import { IdentExpression } from "../../../../../../src/engine/expressions/transformations/expression/Expressions.js";
import { ColumnId } from "../../../../../../src/engine/identifiers/id/ColumnId.js";
import { toPlainString, type Decimal } from "../../../../../../src/engine/java/JavaBigDecimal.js";
import type { TemporalAccessor } from "../../../../../../src/engine/java/time/TemporalAccessor.js";
import type { DataType, DataTypeVisitor, TagType } from "../../../../../../src/engine/types/data/datatype/DataType.js";
import type { DateTimeInfo } from "../../../../../../src/engine/types/data/datatype/DateTimeInfo.js";
import type { NumberInfo } from "../../../../../../src/engine/types/data/datatype/NumberInfo.js";
import type { TypeId } from "../../../../../../src/engine/types/data/datatype/TypeId.js";
import type { Unit } from "../../../../../../src/engine/types/data/unit/Unit.js";
import { Either } from "../../../../../../src/engine/utility-adt/utility/adt/Either.js";
import { IdentifierUtility } from "../../../../../../src/engine/utility/utility/IdentifierUtility.js";
import type { TaggedValue } from "../../../../../../src/engine/utility/utility/TaggedValue.js";
import { ListExList, Utility, type ListEx, type Record } from "../../../../../../src/engine/utility/utility/Utility.js";
import type { Value } from "../../../../../../src/engine/utility/utility/Value.js";
import { BackwardsProvider } from "./BackwardsProvider.js";
import type { ExpressionMaker } from "./ExpressionMaker.js";

export class BackwardsColumnRef extends BackwardsProvider
{
    private readonly columns: ((rs: RecordSet) => Column)[] = [];

    public override terminals(type: DataType, value: Value): ExpressionMaker[]
    {
        return [() => {
            const name = new ColumnId(IdentifierUtility.identNum("GEV Col" as ExpressionIdentifier, this.columns.length));
            const parent = this.parent;
            this.columns.push(rs => type.apply<Column>(new class implements DataTypeVisitor<Column>
            {
                public number(numberInfo: NumberInfo): Column
                {
                    return new MemoryNumericColumn(rs, name, numberInfo, [toPlainString(Utility.toBigDecimal(value as Decimal))]);
                }

                public text(): Column
                {
                    return new MemoryStringColumn(rs, name, [Either.right<string, string>(value as string)], "");
                }

                public date(dateTimeInfo: DateTimeInfo): Column
                {
                    return new MemoryTemporalColumn(rs, name, dateTimeInfo, [Either.right<string, TemporalAccessor>(value as TemporalAccessor)], dateTimeInfo.getDefaultValue());
                }

                public bool(): Column
                {
                    return new MemoryBooleanColumn(rs, name, [Either.right<string, boolean>(value as boolean)], false);
                }

                public tagged(typeName: TypeId, typeVars: readonly Either<Unit, DataType>[], tags: readonly TagType<DataType>[]): Column
                {
                    return new MemoryTaggedColumn(rs, name, typeName, typeVars, tags, [Either.right<string, TaggedValue>(value as TaggedValue)], parent.makeValue(type) as TaggedValue);
                }

                public record(fields: ReadonlyMap<ExpressionIdentifier, DataType>): Column
                {
                    return new MemoryRecordColumn(rs, name, fields, [Either.right<string, Record>(value as Record)], parent.makeValue(type) as Record);
                }

                public array(inner: DataType): Column
                {
                    return new MemoryArrayColumn(rs, name, inner, [Either.right<string, ListEx>(value as ListEx)], new ListExList([]));
                }
            }()));
            return IdentExpression.column(name);

        }];
    }

    public override deep(_maxLevels: number, _targetType: DataType, _targetValue: Value): ExpressionMaker[]
    {
        return [];
    }

    public getColumns(): ((rs: RecordSet) => Column)[]
    {
        return this.columns;
    }
}
