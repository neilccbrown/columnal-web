// Port of xyz.columnal.data.TextFileColumn (data module).
import type { ColumnId } from "../../identifiers/id/ColumnId.js";
import { IOException } from "../../java/JavaExceptions.js";
import type { TemporalAccessor } from "../../java/time/TemporalAccessor.js";
import type { DataType, TagType } from "../../types/data/datatype/DataType.js";
import type { DataTypeValue } from "../../types/data/datatype/DataTypeValue.js";
import type { DateTimeInfo } from "../../types/data/datatype/DateTimeInfo.js";
import type { NumberInfo } from "../../types/data/datatype/NumberInfo.js";
import type { TypeId } from "../../types/data/datatype/TypeId.js";
import type { Unit } from "../../types/data/unit/Unit.js";
import { Either } from "../../utility-adt/utility/adt/Either.js";
import { FetchException } from "../../utility-error/error/FetchException.js";
import type { TaggedValue } from "../../utility/utility/TaggedValue.js";
import { Utility, type ReadState } from "../../utility/utility/Utility.js";
import { Column } from "./Column.js";
import { BooleanColumnStorage } from "./BooleanColumnStorage.js";
import type { ColumnStorage } from "./ColumnStorage.js";
import { NumericColumnStorage } from "./NumericColumnStorage.js";
import type { RecordSet } from "./RecordSet.js";
import { StringColumnStorage } from "./StringColumnStorage.js";
import { TaggedColumnStorage } from "./TaggedColumnStorage.js";
import { TemporalColumnStorage } from "./TemporalColumnStorage.js";

/**
 * Created by neil on 22/10/2016.
 */
export class TextFileColumn extends Column
{
    private readonly sep: string | null;
    private readonly columnIndex: number;
    private readonly lastColumn: boolean;
    private reader: ReadState;
    private readonly type: DataTypeValue;

    protected constructor(recordSet: RecordSet, reader: ReadState, sep: string | null, quote: string | null,
                          columnName: ColumnId, columnIndex: number, totalColumns: number,
                          createStorage: (beforeGet: ColumnStorage.BeforeGet<never> | null) => ColumnStorage<unknown>,
                          addValues: (storage: ColumnStorage<unknown>, values: string[]) => void)
    {
        super(recordSet, columnName);
        this.sep = sep;
        this.reader = reader;
        this.columnIndex = columnIndex;
        this.lastColumn = columnIndex === totalColumns - 1;
        const theStorage = createStorage((storage: ColumnStorage<unknown>, rowIndex: number, _prog) =>
        {
            try
            {
                while (rowIndex >= storage.filled())
                {
                    // Should we share loading across columns for the same file?
                    const next: string[] = [];
                    this.reader = Utility.readColumnChunk(this.reader, sep, quote, columnIndex, next);
                    addValues(storage, next);
                    // If we're not adding any more, give up and thus prevent infinite loop:
                    if (next.length === 0)
                        break;
                }
            }
            catch (e)
            {
                if (e instanceof IOException)
                    throw new FetchException("Error reading file " + reader.getAbsolutePath(), e);
                throw e;
            }
        });
        this.type = theStorage.getType();

    }

    public getType(): DataTypeValue
    {
        return this.type;
    }

    public static dateColumn(recordSet: RecordSet, reader: ReadState, sep: string | null, quote: string | null, columnName: ColumnId, columnIndex: number, totalColumns: number, dateTimeInfo: DateTimeInfo, parse: (s: string) => Either<string, TemporalAccessor>): TextFileColumn
    {
        return new TextFileColumn(recordSet, reader, sep, quote, columnName, columnIndex, totalColumns,
            fill => new TemporalColumnStorage(dateTimeInfo, fill as ColumnStorage.BeforeGet<TemporalColumnStorage> | null, true),
            (storage, values) => (storage as TemporalColumnStorage).addAll(Utility.mapListInt(values, parse))
        );

    }

    public static numericColumn(recordSet: RecordSet, reader: ReadState, sep: string | null, quote: string | null, columnName: ColumnId, columnIndex: number, totalColumns: number, numberInfo: NumberInfo, processString: ((s: string) => string) | null): TextFileColumn
    {
        return new TextFileColumn(recordSet, reader, sep, quote, columnName, columnIndex, totalColumns,
            fill => new NumericColumnStorage(numberInfo, fill as ColumnStorage.BeforeGet<NumericColumnStorage> | null, true),
            (storage, values) =>
            {
                for (const value of values)
                {
                    let processed = value;
                    if (processString !== null)
                        processed = processString(processed);
                    (storage as NumericColumnStorage).addRead(processed);
                }
            }
        );
    }

    public static stringColumn(recordSet: RecordSet, reader: ReadState, sep: string | null, quote: string | null, columnName: ColumnId, columnIndex: number, totalColumns: number): TextFileColumn
    {
        return new TextFileColumn(recordSet, reader, sep, quote, columnName, columnIndex, totalColumns,
            fill => new StringColumnStorage(fill as ColumnStorage.BeforeGet<StringColumnStorage> | null, true),
            (storage, values) => (storage as StringColumnStorage).addAll(values.map(x => Either.right<string, string>(x)))
        );
    }

    /**
     * PORT-NOTE: bug fix.  Java has no boolean text file column, so TextImporter could not import a
     * column guessed to be boolean (see TextImporter.makeRecordSet).
     */
    public static booleanColumn(recordSet: RecordSet, reader: ReadState, sep: string | null, quote: string | null, columnName: ColumnId, columnIndex: number, totalColumns: number, parse: (s: string) => Either<string, boolean>): TextFileColumn
    {
        return new TextFileColumn(recordSet, reader, sep, quote, columnName, columnIndex, totalColumns,
            fill => new BooleanColumnStorage(fill as ColumnStorage.BeforeGet<BooleanColumnStorage> | null, true),
            (storage, values) => (storage as BooleanColumnStorage).addAll(values.map(parse))
        );
    }

    public static taggedColumn(recordSet: RecordSet, reader: ReadState, sep: string | null, quote: string | null, columnName: ColumnId, columnIndex: number, totalColumns: number, typeName: TypeId, typeVars: readonly Either<Unit, DataType>[], tagTypes: readonly TagType<DataType>[], parseValue: (s: string) => Either<string, TaggedValue>): TextFileColumn
    {
        return new TextFileColumn(recordSet, reader, sep, quote, columnName, columnIndex, totalColumns,
            fill => new TaggedColumnStorage(typeName, typeVars, tagTypes, fill as ColumnStorage.BeforeGet<TaggedColumnStorage> | null, true),
            (storage, values) =>
            {
                (storage as TaggedColumnStorage).addAll(Utility.mapListEx(values, parseValue));
            }
        );
    }

    public getAlteredState(): Column.AlteredState
    {
        // If we are direct from text file, we must be new:
        return Column.AlteredState.OVERWRITTEN;
    }

    public override getEditableStatus(): Column.EditableStatus
    {
        return new Column.EditableStatus(false, null);
    }
}
