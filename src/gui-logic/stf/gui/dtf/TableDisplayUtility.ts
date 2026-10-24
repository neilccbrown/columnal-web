// Port of xyz.columnal.gui.dtf.TableDisplayUtility (stf module): the logic of how a column's cells
// are shown and edited (which recogniser parses each type, and each type's cell style).
//
// PORT-DEFERRED: makeStableViewColumns, getDisplay, makeField, valueAndComponent and
// GetValueAndComponent, which make the column's cells (EditorKitCache, DocumentTextField and the
// JavaFX column details), and the GetAdditionalMenuItems and GetDataPosition interfaces (Phase 8).
// They use recogniser and stfStylesFor below; numbers also get a NumberColumnFormatter.
import type { ExpressionIdentifier, TableDataColIndex } from "../../../../engine/anns/Annotations.js";
import type { DataType, DataTypeVisitorEx, TagType } from "../../../../engine/types/data/datatype/DataType.js";
import type { DateTimeInfo } from "../../../../engine/types/data/datatype/DateTimeInfo.js";
import type { NumberInfo } from "../../../../engine/types/data/datatype/NumberInfo.js";
import type { TypeId } from "../../../../engine/types/data/datatype/TypeId.js";
import type { Unit } from "../../../../engine/types/data/unit/Unit.js";
import type { Either } from "../../../../engine/utility-adt/utility/adt/Either.js";
import { Utility } from "../../../../engine/utility/utility/Utility.js";
import type { Value } from "../../../../engine/utility/utility/Value.js";
import type { Recogniser } from "./Recogniser.js";
import { BooleanRecogniser } from "./recognisers/BooleanRecogniser.js";
import { ListRecogniser } from "./recognisers/ListRecogniser.js";
import { NumberRecogniser } from "./recognisers/NumberRecogniser.js";
import { RecordRecogniser } from "./recognisers/RecordRecogniser.js";
import { StringRecogniser } from "./recognisers/StringRecogniser.js";
import { TaggedRecogniser } from "./recognisers/TaggedRecogniser.js";
import { TemporalRecogniser } from "./recognisers/TemporalRecogniser.js";

/**
 * Created by neil on 01/05/2017.
 */
export class TableDisplayUtility
{
    public static displayCol(col: number): TableDataColIndex
    {
        return col;
    }

    public static stfStylesFor(dataType: DataType): readonly string[]
    {
        return dataType.apply<readonly string[]>({
            number(_numberInfo: NumberInfo): readonly string[]
            {
                return ["stf-cell-number"];
            },

            text(): readonly string[]
            {
                return ["stf-cell-text"];
            },

            date(_dateTimeInfo: DateTimeInfo): readonly string[]
            {
                return ["stf-cell-datetime"];
            },

            bool(): readonly string[]
            {
                return ["stf-cell-bool"];
            },

            tagged(_typeName: TypeId, _typeVars: readonly Either<Unit, DataType>[], _tags: readonly TagType<DataType>[]): readonly string[]
            {
                return ["stf-cell-tagged"];
            },

            record(_fields: ReadonlyMap<ExpressionIdentifier, DataType>): readonly string[]
            {
                return ["stf-cell-record"];
            },

            array(_inner: DataType | null): readonly string[]
            {
                return ["stf-cell-array"];
            },
        });
    }

    public static recogniser(dataType: DataType, topLevel: boolean): TableDisplayUtility.RecogniserAndType<Value>
    {
        const r = <T extends Value>(recogniser: Recogniser<T>, itemClass: string): TableDisplayUtility.RecogniserAndType<Value> =>
        {
            return new TableDisplayUtility.RecogniserAndType<T>(recogniser, itemClass) as unknown as TableDisplayUtility.RecogniserAndType<Value>;
        };
        const visitor: DataTypeVisitorEx<TableDisplayUtility.RecogniserAndType<Value>> = {
            number(_numberInfo: NumberInfo)
            {
                return r(new NumberRecogniser(), "Number");
            },

            text()
            {
                return r(new StringRecogniser(topLevel), "String");
            },

            date(dateTimeInfo: DateTimeInfo)
            {
                return r(new TemporalRecogniser(dateTimeInfo.getType()), "TemporalAccessor");
            },

            bool()
            {
                return r(new BooleanRecogniser(), "Boolean");
            },

            tagged(_typeName: TypeId, _typeVars: readonly Either<Unit, DataType>[], tags: readonly TagType<DataType>[])
            {
                return r(new TaggedRecogniser(Utility.mapListInt(tags, tt => tt.mapInt(t => TableDisplayUtility.recogniser(t, false).recogniser))), "TaggedValue");
            },

            record(fields: ReadonlyMap<ExpressionIdentifier, DataType>)
            {
                return r(new RecordRecogniser(new Map(Utility.mapValuesInt(fields, t => TableDisplayUtility.recogniser(t, false).recogniser))), "Record");
            },

            array(inner: DataType)
            {
                return r(new ListRecogniser(TableDisplayUtility.recogniser(inner, false).recogniser), "ListEx");
            },
        };
        return dataType.apply(visitor);
    }
}

export namespace TableDisplayUtility
{
    export class RecogniserAndType<T extends Value>
    {
        public readonly recogniser: Recogniser<T>;
        // Java: Class<T>; here the Java class's simple name ("Number", "String", ...)
        public readonly itemClass: string;

        /** @internal Java: package-visible */
        public constructor(recogniser: Recogniser<T>, itemClass: string)
        {
            this.recogniser = recogniser;
            this.itemClass = itemClass;
        }
    }
}
